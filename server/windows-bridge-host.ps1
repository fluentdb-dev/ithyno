param(
  [Parameter(Mandatory = $true)]
  [string]$PipeName
)

$ErrorActionPreference = 'Stop'

# Node/libuv does not expose SECURITY_ATTRIBUTES or
# PIPE_REJECT_REMOTE_CLIENTS for Windows named pipes.  This tiny host owns the
# pipe handle so the security descriptor is present at creation time; stdin and
# stdout are a private transport to the parent ithyno process.
$source = @'
using System;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

public static class IthynoWindowsBridgeHost
{
    private const uint PIPE_ACCESS_DUPLEX = 0x00000003;
    private const uint FILE_FLAG_FIRST_PIPE_INSTANCE = 0x00080000;
    private const uint PIPE_TYPE_BYTE = 0x00000000;
    private const uint PIPE_READMODE_BYTE = 0x00000000;
    private const uint PIPE_WAIT = 0x00000000;
    private const uint PIPE_REJECT_REMOTE_CLIENTS = 0x00000008;
    private const uint SDDL_REVISION_1 = 1;
    private const int ERROR_PIPE_CONNECTED = 535;
    private const int MAX_INSTANCES = 16;

    private static readonly ConcurrentDictionary<string, NamedPipeServerStream> Connections =
        new ConcurrentDictionary<string, NamedPipeServerStream>();
    private static readonly object OutputLock = new object();
    private static readonly ManualResetEventSlim ListenerReady = new ManualResetEventSlim(false);
    private static int _firstInstance = 1;
    private static string _pipePath = "";
    private static string _sddl = "";

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(
        string stringSecurityDescriptor,
        uint stringSDRevision,
        out IntPtr securityDescriptor,
        out uint securityDescriptorSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipe(
        string name,
        uint openMode,
        uint pipeMode,
        uint maxInstances,
        uint outBufferSize,
        uint inBufferSize,
        uint defaultTimeout,
        ref SECURITY_ATTRIBUTES securityAttributes);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ConnectNamedPipe(SafePipeHandle namedPipe, IntPtr overlapped);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    private static SafePipeHandle CreateSecurePipe()
    {
        IntPtr descriptor;
        uint descriptorSize;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptor(
                _sddl, SDDL_REVISION_1, out descriptor, out descriptorSize))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        try
        {
            var attributes = new SECURITY_ATTRIBUTES {
                nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)),
                lpSecurityDescriptor = descriptor,
                bInheritHandle = false
            };
            uint openMode = PIPE_ACCESS_DUPLEX;
            if (Interlocked.Exchange(ref _firstInstance, 0) == 1)
                openMode |= FILE_FLAG_FIRST_PIPE_INSTANCE;

            var handle = CreateNamedPipe(
                _pipePath,
                openMode,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                MAX_INSTANCES,
                262144,
                262144,
                5000,
                ref attributes);
            if (handle == null || handle.IsInvalid)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

            return handle;
        }
        finally
        {
            LocalFree(descriptor);
        }
    }

    private static void Emit(string line)
    {
        lock (OutputLock)
        {
            Console.Out.WriteLine(line);
            Console.Out.Flush();
        }
    }

    private static async Task AcceptOne()
    {
        var handle = CreateSecurePipe();
        ListenerReady.Set();
        bool connected = ConnectNamedPipe(handle, IntPtr.Zero);
        if (!connected && Marshal.GetLastWin32Error() != ERROR_PIPE_CONNECTED)
        {
            handle.Dispose();
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        var pipe = new NamedPipeServerStream(PipeDirection.InOut, false, true, handle);

        // Keep another secured instance waiting while this request is handled.
        Task ignoredAccept = Task.Run((Func<Task>)AcceptOne);

        var bytes = new MemoryStream();
        var chunk = new byte[4096];
        bool oversized = false;
        bool complete = false;
        while (!complete)
        {
            int read = await pipe.ReadAsync(chunk, 0, chunk.Length).ConfigureAwait(false);
            if (read == 0) break;
            int count = read;
            for (int i = 0; i < read; i++)
            {
                if (chunk[i] == (byte)'\n')
                {
                    count = i;
                    complete = true;
                    break;
                }
            }
            bytes.Write(chunk, 0, count);
            if (bytes.Length > 262144)
            {
                oversized = true;
                break;
            }
        }
        string payload = oversized ? "__ITHYNO_OVERSIZED__" : Encoding.UTF8.GetString(bytes.ToArray()).TrimEnd('\r');
        bytes.Dispose();
        if (String.IsNullOrEmpty(payload))
        {
            pipe.Dispose();
            return;
        }

        string id = Guid.NewGuid().ToString("N");
        if (!Connections.TryAdd(id, pipe))
        {
            pipe.Dispose();
            return;
        }
        Emit("REQUEST\t" + id + "\t" + Convert.ToBase64String(Encoding.UTF8.GetBytes(payload)));
    }

    private static async Task WriteResponse(string id, string payload)
    {
        NamedPipeServerStream pipe;
        if (!Connections.TryRemove(id, out pipe)) return;
        try
        {
            var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
            await writer.WriteLineAsync(payload).ConfigureAwait(false);
        }
        finally
        {
            pipe.Dispose();
        }
    }

    public static void Run(string pipeName)
    {
        if (String.IsNullOrWhiteSpace(pipeName) || pipeName.IndexOf('\\') >= 0)
            throw new ArgumentException("Invalid pipe name", "pipeName");

        var identity = WindowsIdentity.GetCurrent();
        string sid = identity.User == null ? null : identity.User.Value;
        if (String.IsNullOrWhiteSpace(sid))
            throw new InvalidOperationException("The current Windows user SID is unavailable");

        _pipePath = @"\\.\pipe\LOCAL\" + pipeName;
        // Protected DACL: only the exact process user SID receives access.
        _sddl = "O:" + sid + "D:P(A;;GA;;;" + sid + ")";

        Task ignoredFirstAccept = Task.Run((Func<Task>)AcceptOne);
        if (!ListenerReady.Wait(10000))
            throw new TimeoutException("The secured Windows bridge pipe was not created in time");
        Emit("READY\t" + sid + "\tREMOTE_REJECTED");

        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            var fields = line.Split(new [] { '\t' }, 3);
            if (fields.Length != 3 || fields[0] != "RESPONSE") continue;
            try
            {
                string payload = Encoding.UTF8.GetString(Convert.FromBase64String(fields[2]));
                Task ignoredResponse = Task.Run(() => WriteResponse(fields[1], payload));
            }
            catch { }
        }
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp
[IthynoWindowsBridgeHost]::Run($PipeName)
