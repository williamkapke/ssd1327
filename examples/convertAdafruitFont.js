// Text manipulation of an Adafruit C font file to javascript text suitable for use with this lib
// To run:
//  node examples/convertAdafruitFont.js > FreeMono24pt7b.js
const fs = require('fs')
const path = require('path')
const source = path.resolve(process.argv[2])
const sourceName = path.parse(source).name
const destination = path.resolve(process.argv[3] || sourceName+'.js')

const text = fs.readFileSync(source).toString()
let maxHeight = 0, maxWidth = 0, baseline = 0
let m = (char, start, width, height, xAdvance, xOffset, yOffset) => {
  if (height > maxHeight) {
    maxHeight = height
    baseline = yOffset + height
  }
  if (width > maxWidth) maxWidth = width
  return {
    char,
    start,
    end: start + Math.ceil((width * height)/8),
    width, height, xAdvance, xOffset, yOffset,
    data: undefined
  }
}

const sections = text.split('const')
const result = sections.map((section) => {
  if (section.includes('Bitmaps[]')) {
    const name = section.match(/(\w+)Bitmaps\[\]/)[1]
    // convert to javacsript Buffer
    section = section.substr(section.indexOf('{')+1)
    section = 'const data = Buffer.from([' + section.replace(/[^']}/, '\n])')
    return '// ' + name + '\n' + section
  }
  if (section.includes('GFXfont')) {
    const args = section.split(',')
    const start = '0x' + parseInt(args[2]).toString(16)
    const stop = '0x' + parseInt(args[3]).toString(16)
    const yAdvance = parseInt(args[4].substr(0, args[4].indexOf('}')))

    return `
const block = {
  width: 28,
  height: 38,
  xAdvance: 28,
  xOffset: 0,
  yOffset: ${-(maxHeight-baseline)},
  data: Buffer.alloc(${maxHeight*maxWidth}, 0xFF)
}
module.exports = {
  start: ${start},
  stop: ${stop},
  yAdvance: ${yAdvance},
  metadata,
  height: ${maxHeight},
  width: ${maxWidth},
  baseline: ${baseline},
  char: (char) => {
    const meta = metadata[char]
    if (!meta) return block
    if (!meta.data) {
      meta.data = data.subarray(meta.start, meta.end)
    }
    return meta
  }
}`
  }
  if (section.includes('GFXglyph')) {
    const metadata = []
    section = section.substr(section.indexOf('{')+1)
    let items = section.split(/[^']\{/).slice(1)
    items.forEach((item) => {
      if (!item) return;
      // maybe flaky? requires there to be a comment with the char like: // 0x7E '~'
      let char = item.match(/'.'/)[0][1]
      // if (char === "'" || char === '\\') char = '\\' + char
      const args = item.match(/.+?\}/)[0].replace('}','').split(',').map((i) => parseInt(i, 10))
      metadata.push(m(char, ...args))
    })
    items = metadata.map((item) => `${JSON.stringify(item.char)}: ${JSON.stringify(item)}` )
    return 'const metadata = {\n' + items.join(',\n') + '\n}'
  }
})

fs.writeFileSync(destination, result.join('\n'))
//console.log(result.join('\n'))

