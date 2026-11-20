// Draws the knoter app icon: a cord tied in a trefoil knot, green on paper in light
// appearance and cream on green in dark.
//
// Usage: AppIcon <output directory>, which receives
//   AppIcon.iconset/        the whole light icon on its plate, for AppIcon.icns
//   knot-*.png, grid-*.png  the layers of AppIcon.icon, one of each per appearance
// The plate colors here are repeated as the fills in AppIcon.icon/icon.json.
import AppKit
import SwiftUI
import UniformTypeIdentifiers

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(
    srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
    blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}
func mix(_ a: UInt32, _ b: UInt32, _ t: CGFloat) -> CGColor {
  func part(_ shift: UInt32) -> CGFloat {
    let x = CGFloat((a >> shift) & 0xff), y = CGFloat((b >> shift) & 0xff)
    return (x + (y - x) * t) / 255
  }
  return CGColor(srgbRed: part(16), green: part(8), blue: part(0), alpha: 1)
}

struct Theme {
  var top: UInt32, bottom: UInt32
  var dot: CGColor, edge: CGColor
  /// The cord: its shaded rim, its body, and the light along its middle. Opaque, so a
  /// strand drawn twice looks the same as one drawn once.
  var rim: UInt32, cord: UInt32, shine: UInt32
}
// The app's own colors: --primary on its paper, and the reverse.
let light = Theme(
  top: 0xffffff, bottom: 0xeaf0e6, dot: rgb(0x315c45, 0.12), edge: rgb(0x315c45, 0.10),
  rim: 0x244735, cord: 0x356a4f, shine: 0x5d9478)
let dark = Theme(
  top: 0x3d7058, bottom: 0x21412f, dot: rgb(0xffffff, 0.07), edge: rgb(0xffffff, 0.10),
  rim: 0xc9cdb8, cord: 0xf3f1e3, shine: 0xfdfcf6)

/// macOS icon grid: an 824 pt rounded square centered in 1024, with continuous corners.
let plate = CGRect(x: 100, y: 100, width: 824, height: 824)
let platePath = RoundedRectangle(cornerRadius: 185.4, style: .continuous).path(in: plate).cgPath
let space = CGColorSpace(name: CGColorSpace.sRGB)!

/// The trefoil, one lobe up, as a closed curve on the 1024 grid.
let cordWidth: CGFloat = 70
let knot: [CGPoint] = (0..<720).map { step in
  let t = CGFloat(step) / 720 * 2 * .pi
  return CGPoint(x: 512 + (sin(t) + 2 * sin(2 * t)) * 88, y: 530 + (cos(t) - 2 * cos(2 * t)) * 88)
}
/// Where the curve passes over itself, as the index of the strand on top. Along the cord,
/// crossings alternate over and under: that is what makes it a knot.
let overpasses: [Int] = {
  let n = knot.count
  func side(_ p: CGPoint, _ q: CGPoint, _ r: CGPoint) -> CGFloat {
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  }
  var meetings: [Int] = []
  for i in 0..<n where i + 8 < n {
    for j in (i + 8)..<n where !(i < 8 && j > n - 8) {
      let a = knot[i], b = knot[(i + 1) % n], c = knot[j], d = knot[(j + 1) % n]
      if side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0 {
        meetings.append(contentsOf: [i, j])
      }
    }
  }
  return meetings.sorted().enumerated().filter { $0.offset % 2 == 0 }.map { $0.element }
}()

/// The app's dot grid, over the plate.
func drawGrid(_ theme: Theme, _ ctx: CGContext) {
  ctx.setFillColor(theme.dot)
  var y: CGFloat = 148
  while y < plate.maxY {
    var x: CGFloat = 148
    while x < plate.maxX {
      ctx.fillEllipse(in: CGRect(x: x - 3.4, y: y - 3.4, width: 6.8, height: 6.8))
      x += 56
    }
    y += 56
  }
}

/// The cord. `cutGaps` clears the gap at each crossing instead of painting it in the
/// plate's color, for a layer that lies over a plate drawn elsewhere.
func drawCord(_ theme: Theme, _ ctx: CGContext, width: CGFloat, shadow: CGFloat?, cutGaps: Bool) {
  let n = knot.count
  func path(_ from: Int, _ to: Int) -> CGMutablePath {
    let line = CGMutablePath()
    line.move(to: knot[(from + n) % n])
    for i in (from + 1)...to { line.addLine(to: knot[(i + n) % n]) }
    return line
  }
  func cord(_ line: CGPath, cap: CGLineCap, shine: Bool) {
    ctx.setLineJoin(.round)
    ctx.setLineCap(cap)
    var strokes = [(rgb(theme.rim), width), (rgb(theme.cord), width - 12)]
    if shine { strokes.append((rgb(theme.shine), width * 0.26)) }
    for (color, w) in strokes {
      ctx.addPath(line)
      ctx.setStrokeColor(color)
      ctx.setLineWidth(w)
      ctx.strokePath()
    }
  }
  let shine = shadow != nil || cutGaps
  let whole = path(0, n - 1)
  whole.closeSubpath()
  if let scale = shadow {
    // A soft shadow under the whole cord lifts it off the plate; offsets are in device space.
    ctx.saveGState()
    ctx.setShadow(
      offset: CGSize(width: 0, height: -7 * scale), blur: 16 * scale, color: rgb(0x000000, 0.22))
    ctx.addPath(whole)
    ctx.setLineJoin(.round)
    ctx.setStrokeColor(rgb(theme.rim))
    ctx.setLineWidth(width)
    ctx.strokePath()
    ctx.restoreGState()
  }
  cord(whole, cap: .round, shine: shine)

  // Each crossing again, the strand on top last: a gap, then the cord over it. The gap is
  // shorter than the strand redrawn over it, so its ends are always covered.
  let reach = Int(width * 0.95 / hypot(knot[1].x - knot[0].x, knot[1].y - knot[0].y))
  for index in overpasses {
    ctx.addPath(path(index - reach, index + reach))
    ctx.setLineCap(.butt)
    ctx.setBlendMode(cutGaps ? .clear : .normal)
    ctx.setStrokeColor(mix(theme.top, theme.bottom, (knot[index].y - plate.minY) / plate.height))
    ctx.setLineWidth(width + 26)
    ctx.strokePath()
    ctx.setBlendMode(.normal)
    cord(path(index - reach - reach / 3, index + reach + reach / 3), cap: .butt, shine: shine)
  }
}

func bitmap(_ size: Int) -> CGContext {
  let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  // The 1024 grid, y down.
  ctx.translateBy(x: 0, y: CGFloat(size))
  ctx.scaleBy(x: CGFloat(size) / 1024, y: -CGFloat(size) / 1024)
  return ctx
}
func write(_ ctx: CGContext, to path: String) {
  let destination = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, ctx.makeImage()!, nil)
  guard CGImageDestinationFinalize(destination) else { fatalError("Could not write \(path)") }
}

/// The whole icon at one pixel size: plate, shadow, grid, and cord.
func icon(_ theme: Theme, _ size: Int) -> CGContext {
  let ctx = bitmap(size)
  let scale = CGFloat(size) / 1024
  // Small sizes drop the grid and the cord's light, and get a heavier, slightly larger cord.
  let small = size <= 64
  ctx.saveGState()
  ctx.setShadow(
    offset: CGSize(width: 0, height: -10 * scale), blur: 22 * scale, color: rgb(0x000000, 0.26))
  ctx.addPath(platePath)
  ctx.setFillColor(rgb(theme.bottom))
  ctx.fillPath()
  ctx.restoreGState()

  ctx.saveGState()
  ctx.addPath(platePath)
  ctx.clip()
  let wash = CGGradient(
    colorsSpace: space, colors: [rgb(theme.top), rgb(theme.bottom)] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(
    wash, start: CGPoint(x: 512, y: plate.minY), end: CGPoint(x: 512, y: plate.maxY), options: [])
  if !small { drawGrid(theme, ctx) }
  if small {
    ctx.translateBy(x: 512, y: 512)
    ctx.scaleBy(x: 1.08, y: 1.08)
    ctx.translateBy(x: -512, y: -512)
  }
  drawCord(
    theme, ctx, width: cordWidth * (small ? 1.14 : 1), shadow: small ? nil : scale, cutGaps: false)
  ctx.restoreGState()

  ctx.addPath(platePath)
  ctx.setStrokeColor(theme.edge)
  ctx.setLineWidth(3)
  ctx.strokePath()
  return ctx
}

/// One layer of AppIcon.icon: the plate's contents alone, on a clear ground, stretched so
/// that the plate is the whole canvas. The system draws the plate, its edge, and shadows.
func layer(_ draw: (CGContext) -> Void) -> CGContext {
  let ctx = bitmap(1024)
  ctx.translateBy(x: 512, y: 512)
  ctx.scaleBy(x: 1024 / plate.width, y: 1024 / plate.height)
  ctx.translateBy(x: -512, y: -512)
  draw(ctx)
  return ctx
}

guard CommandLine.arguments.count == 2 else { fatalError("Usage: AppIcon <output directory>") }
let output = CommandLine.arguments[1]
let iconset = "\(output)/AppIcon.iconset"
try FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
for (points, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
  let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
  write(icon(light, points * scale), to: "\(iconset)/\(name)")
}
for (name, theme) in [("light", light), ("dark", dark)] {
  write(
    layer { drawCord(theme, $0, width: cordWidth, shadow: nil, cutGaps: true) },
    to: "\(output)/knot-\(name).png")
  write(layer { drawGrid(theme, $0) }, to: "\(output)/grid-\(name).png")
}
