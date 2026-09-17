import Foundation
import Darwin

// Keep the registered, signed launcher alive while its bundled Node child runs.
// The launcher forwards termination and keeps launchd aware of the child lifetime.
var length: UInt32 = 0
_NSGetExecutablePath(nil, &length)
var executable = [CChar](repeating: 0, count: Int(length))
guard _NSGetExecutablePath(&executable, &length) == 0 else { exit(1) }
let contents = URL(fileURLWithPath: String(cString: executable)).resolvingSymlinksInPath().deletingLastPathComponent().deletingLastPathComponent()
let resources = contents.appendingPathComponent("Resources")
let runtime = resources.appendingPathComponent("runtime/node").path
let entry = resources.appendingPathComponent("backend/service.mjs").path
setenv("KNOTER_RESOURCES", resources.appendingPathComponent("resources").path, 1)
setenv("PATH", "/usr/bin:/bin:/usr/sbin:/sbin", 1)
let child = Process()
child.executableURL = URL(fileURLWithPath: runtime)
child.arguments = [entry]
child.environment = ProcessInfo.processInfo.environment.merging([
    "KNOTER_RESOURCES": resources.appendingPathComponent("resources").path,
    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"
]) { _, new in new }
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
termination.setEventHandler { if child.isRunning { child.terminate() } }
termination.resume()
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .global())
interrupt.setEventHandler { if child.isRunning { child.terminate() } }
interrupt.resume()
do { try child.run(); child.waitUntilExit(); exit(child.terminationStatus) }
catch { fputs("Knoter service launch failed: \(error.localizedDescription)\n", stderr); exit(1) }
