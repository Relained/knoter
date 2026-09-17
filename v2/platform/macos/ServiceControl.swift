import Foundation
import ServiceManagement
import Darwin

// User-approved unsigned local LaunchAgent demo; SMAppService needs an Apple identity.
let label = "com.knoter.wiki-demo.worker"
let domain = "gui/\(getuid())"
let home = FileManager.default.homeDirectoryForCurrentUser
let plistURL = home.appendingPathComponent("Library/LaunchAgents/\(label).plist")
let action = CommandLine.arguments.dropFirst().first ?? "status"
func launchctl(_ arguments: [String], allowMissing: Bool = false) throws -> String {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    process.arguments = arguments
    process.standardOutput = output
    process.standardError = output
    try process.run()
    let data = output.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    let result = String(decoding: data, as: UTF8.self)
    if process.terminationStatus != 0 && !allowMissing {
        throw NSError(domain: "KnoterLaunchAgent", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: result])
    }
    return process.terminationStatus == 0 ? result : ""
}
do {
    if action.hasPrefix("sm-") {
        let service = SMAppService.agent(plistName: "\(label).plist")
        switch action {
        case "sm-register": try service.register()
        case "sm-unregister": try service.unregister()
        default: break
        }
        let states: [SMAppService.Status: String] = [.notRegistered: "not_registered", .enabled: "enabled", .requiresApproval: "requires_approval", .notFound: "not_found"]
        let data = try JSONSerialization.data(withJSONObject: ["status": states[service.status] ?? "unknown"])
        print(String(decoding: data, as: UTF8.self))
        exit(0)
    }
    switch action {
    case "register":
        if try launchctl(["print", "\(domain)/\(label)"], allowMissing: true).isEmpty {
            let launcher = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/KnoterServiceLauncher").path
            guard FileManager.default.isExecutableFile(atPath: launcher) else {
                throw NSError(domain: "Knoter", code: 1, userInfo: [NSLocalizedDescriptionKey: "Run this helper from the installed demo app."])
            }
            let logs = home.appendingPathComponent("Library/Logs/Knoter Wiki Demo")
            try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try FileManager.default.createDirectory(at: plistURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let plist: [String: Any] = ["Label": label, "ProgramArguments": [launcher], "RunAtLoad": true, "KeepAlive": true, "ThrottleInterval": 10, "ProcessType": "Background", "StandardOutPath": logs.appendingPathComponent("service.log").path, "StandardErrorPath": logs.appendingPathComponent("service-error.log").path]
            try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0).write(to: plistURL, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: plistURL.path)
            _ = try launchctl(["bootstrap", domain, plistURL.path])
        }
    case "unregister":
        _ = try launchctl(["bootout", "\(domain)/\(label)"], allowMissing: true)
        if FileManager.default.fileExists(atPath: plistURL.path) { try FileManager.default.removeItem(at: plistURL) }
    case "approvalSettings": SMAppService.openSystemSettingsLoginItems()
    case "status": break
    default: throw NSError(domain: "Knoter", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unknown service action"])
    }
    let state = try launchctl(["print", "\(domain)/\(label)"], allowMissing: true)
    let status = state.isEmpty ? "local_agent_disabled" : state.contains("state = running") ? "local_agent_running" : "local_agent_registered"
    let data = try JSONSerialization.data(withJSONObject: ["status": status, "registration": "local LaunchAgent demo"])
    print(String(decoding: data, as: UTF8.self))
} catch {
    let data = try! JSONSerialization.data(withJSONObject: ["status": "error", "message": error.localizedDescription])
    print(String(decoding: data, as: UTF8.self))
    exit(1)
}
