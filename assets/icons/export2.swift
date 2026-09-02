import AppKit
// 用法: swift export2.swift <symbol> <out.png> <pointSize> ...
let args = Array(CommandLine.arguments.dropFirst())
let canvas: CGFloat = 160
var i = 0
while i + 2 < args.count + 1 && i + 1 < args.count {
    let name = args[i], out = args[i+1]
    let pt = CGFloat(Double(args.count > i+2 ? args[i+2] : "100") ?? 100)
    i += 3
    guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil) else { print("MISS \(name)"); continue }
    let cfg = NSImage.SymbolConfiguration(pointSize: pt, weight: .regular).applying(.init(paletteColors: [.white]))
    guard let sym = img.withSymbolConfiguration(cfg) else { print("CFG \(name)"); continue }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = sym.size
    let sc = min(canvas / s.width, canvas / s.height)
    let w = s.width * sc, h = s.height * sc
    sym.draw(in: NSRect(x: (canvas - w)/2, y: (canvas - h)/2, width: w, height: h))
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
    print("ok \(out) [\(name)]")
}
