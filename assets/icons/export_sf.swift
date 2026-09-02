import AppKit

// 用法: swift export_sf.swift <symbol名> <输出.png> [<symbol名> <输出.png> ...]
let args = Array(CommandLine.arguments.dropFirst())
let size: CGFloat = 120

var i = 0
while i + 1 < args.count {
    let name = args[i], out = args[i + 1]
    i += 2
    guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil) else {
        print("MISS \(name)"); continue
    }
    let config = NSImage.SymbolConfiguration(pointSize: 90, weight: .medium)
        .applying(.init(paletteColors: [.white]))
    guard let sym = img.withSymbolConfiguration(config) else { print("CFG-FAIL \(name)"); continue }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = sym.size
    let scale = min(size / s.width, size / s.height)
    let w = s.width * scale, h = s.height * scale
    sym.draw(in: NSRect(x: (size - w) / 2, y: (size - h) / 2, width: w, height: h))
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
    print("ok \(out)")
}
