// Reference document:
// https://www.waveshare.com/w/upload/a/ac/SSD1327-datasheet.pdf
// Tested with:
//  - Waveshare 1.5inch OLED Display Module 128x128 Pixels 16-bit Grey Level
//  - https://www.amazon.com/gp/product/B079NNZ9V1

const _debug = require('debug')
const DoubleWidthPixelMatrix = require('./matrix.js');
const hex = (v) => v.toString(16).padStart(2, '0')
_debug.formatters.h = (v) => v.length ? Array.prototype.map.call(v, b => hex(b)).join(' ') : hex(v)
const debug = {
  info: _debug('SSD1327_info'),
  verbose: _debug('SSD1327_verbose')
}

const scanDirections = {
  'LRUD': 0x51, // left-right, up-down
  'LRDU': 0x41, // left-right, down-up
  'RLUD': 0x52, // right-left, up-down
  'RLDU': 0x42// right-left, down-up
}
const COMMAND_MODE = 0x80
const DATA_MODE = 0x40
const SEG = 0x15 // horizontal rows
const COM = 0x75 // vertical columns



const SSD1327 = (write) => {
  const matrix = new DoubleWidthPixelMatrix(128,128)

  //re-usable buffer instance...
  const chunk = Buffer.alloc(4096, 0x40)
  const writeChunked = async (buff) => {
    debug.info('writeChunked buff.length=%s', buff.length)
    let cursor = 0
    let copied = 0
    while (cursor < buff.length) {
      copied = buff.copy(chunk, 1, cursor, cursor+4096)
      chunk[0] = DATA_MODE
      cursor += copied
      await write(chunk, copied + 1, false)
    }
  }
  const writeReg = (type, byte) => write(Buffer.from([type, byte]))
  const writeCmd = (byte) => writeReg(COMMAND_MODE, byte)
  const writeCmds = async (...bytes) => {
    const results = []
    for (let i = 0; i < bytes.length; i++) {
      results[i] = await writeCmd(bytes[i])
    }
    return results
  }

  const init = async () => {
    await off()
    await writeCmds(
      0x15, 0x00, 0x7f, // set column address start=0 end=127
      0x75, 0x00, 0x7f, // set row address start=0 end=127
      0x81, 0x80,       // set contrast control
      0xa0, 0x51,       // gment remap
      0xa1, 0x00,       // start line
      0xa2, 0x00,       // display offset
      0xa4,             // rmal display
      0xa8, 0x7f,       // set multiplex ratio
      0xb1, 0xf1,       // set phase leghth
      0xb3, 0x00,       // set dclk: 80Hz:0xc1 90Hz:0xe1   100Hz:0x00   110Hz:0x30 120Hz:0x50   130Hz:0x70
      0xab, 0x01,       // Function selection A
      0xb6, 0x0f,       // set phase leghth

      0xbe, 0x0f,       // set VCOMH Voltage
      0xbc, 0x08,       // set pre-charge voltage level.
      0xd5, 0x62,       // Function selection B
      0xfd, 0x12        // Set Command Lock (locked)
    )
    await setScanDirection('LRUD')
    await clear()
    await on()
    debug.info('init complete')
  }

  // If this is ever changed to use anything other than LRUD,
  // I'm _pretty_ sure this lib would just draw nonsense
  const setScanDirection = async (type) => {
    const dir = scanDirections[type]
    if (!dir) return Promise.reject(new Error('Unknown scan type'))

    await writeCmds(0xa0, dir)
  }

  const clear = async (color = 0x0) =>  {
    // //set the window
    await writeCmds(
      COM, 0, 127, // row
      SEG, 0, 63 // column
    )

    //use only the lower 4 bits
    color &= 0x0F
    // copy left to make 2 pixel wide
    color = (color<<4)|color

    //1 large stream was failing for my screen.
    // ...Break it up in to smaller chunks works.
    const buff = Buffer.alloc(4097, color)
    buff[0] = DATA_MODE
    await write(buff, buff.length, false)
    await write(buff, buff.length, false)

    //update the in-memory version to match
    matrix.clear(color)

    debug.info('cleared')
  }

  const setWindow = async (seg, sEnd, com, cEnd) => {
    debug.info('setWindow seg=[%s,%s] com=[%s,%s]', seg, sEnd, com, cEnd)

    if ((cEnd > matrix.height) || (sEnd > matrix.segWidth)) {
      return Promise.reject(new Error('invalid window'))
    }

    await writeCmds(
      SEG, seg, sEnd,
      COM, com, cEnd
    )
  }

  const on = () => writeCmd(0xAF)
  const off = () => writeCmd(0xAE)
  const dimmed = (yes) => writeCmds(0x81, yes? 0 : 0xcf)

  const fill = async (x1, y1, x2, y2, color) => {
    debug.info('fill [%s,%s] to [%s,%s] color=%h', x1, y1, x2, y2, color)

    const view = matrix.setRange(x1, y1, x2, y2, color)
    if (view) {
      debug.info('filling')
      await setWindow(view.seg.start, view.seg.end, y1, y2)
      await writeChunked(Buffer.from(view))
    }
    else {
      debug.info('No updates in filled area')
    }
  }
  const bitmap = async (x1, y1, width, height, buff) => {
    debug.info('fill [%s,%s] @ [%sx%s]', x1, y1, width, height)

    const view = matrix.bitmap(x1, y1, width, height, buff)
    if (view) {
      debug.info('drawing bitmap')
      await setWindow(view.seg.start, view.seg.end, y1, y1 + height)
      await writeChunked(Buffer.from(view))
    }
    else {
      debug.info('No updates from bitmap')
    }
  }
  const writeMonoText = async (text, font, x = 0, y = 0) => {
    if (!text) return
    const chars = Array.prototype.map.call(text, c => font.char(c))
    const finalArea = { x1: -1, x2: -1, y1: -1, y2: -1 }
    const oddStart = x % 2 // if x starts on an odd bit (the right 4 bits of a seg)
    const fontIsOddWidth = font.width % 2

    // Don't add width when font is odd width
    let width = font.width
    // if font.width is an even number AND x is an odd number, add 1
    if (!fontIsOddWidth && oddStart) width++
    // But, in any scenario- width is required to be positive for a matrix...
    if (width % 2) width++

    //create a matrix to get a view that is the size of the font + padding
    const charMatrix = new DoubleWidthPixelMatrix(width, font.height)

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const y2 = y + font.height
      const xOffset = char.xOffset + (oddStart ? 1 : 0)
      charMatrix.clear()

      // apply the character bitmap to the charMartix
      charMatrix.bitmap(xOffset, char.yOffset + font.height-font.baseline, char.width, char.height, char.data)

      // apply to the screen's matrix and find out if there were any changes
      const changes = matrix.apply(Math.floor(x / 2), y, charMatrix)

      if (changes) {
        // expand the area updated only when needed
        if (finalArea.x1 === -1) finalArea.x1 = x
        finalArea.x2 = Math.min(x + font.width, matrix.width-1)
        if (finalArea.y1 === -1 || finalArea.y1 > y) finalArea.y1 = y
        if (finalArea.y2 < y2) finalArea.y2 = y2
      }
      else {
        debug.info('No updates from bitmap for char: %s', i)
      }
      x+= char.xAdvance
    }


    // only write the data if there was a change!
    if (finalArea.x1 > -1) {
      debug.info('writeMonoText: writing to device: %s', text)
      const view = matrix.view(finalArea.x1, finalArea.y1, finalArea.x2, finalArea.y2)
      // view.visualize
      await setWindow(view.seg.start, view.seg.end, view.com.start, view.com.end)
      await writeChunked(Buffer.from(view))
    }
    else {
      debug.info('writeMonoText: no changes')
    }
  }


  const initialize = init();
  // proxy all external calls through this to make them wait until init is done
  const whenReady = (fn) => async (...args) => {
    await initialize // wait until the initialize promise is resolved
    // now update the iface to reference the function directly
    // so we don't have the overhead of doing this every time
    iface[fn.name] = fn
    return fn.apply(fn, args)
  }

  const iface = {
    on: whenReady(on),
    off: whenReady(off),
    dimmed: whenReady(dimmed),

    fill: whenReady(fill),
    bitmap: whenReady(bitmap),
    writeMonoText: whenReady(writeMonoText),
    clear: whenReady(clear)
  }
  return iface
}


module.exports = {
  I2C: (bus, address) => {
    if (!bus._bus) {
      return Promise.reject(new Error('i2c-bus-promise not found'))
    }

    return SSD1327((data, length = data.length, dbg = true) => {
      // Writing large buffers is too harsh for logging.
      // Allow it to be disabled...
      if (dbg && debug.verbose.enabled) {
        debug.verbose('write [%h]', data.slice(0, length))
      }
      return bus.i2cWrite(address, length, data)
    })
  },

  //TODO - sorry :(
  SPI: () => {
    throw new Error('Not Implemented')
  }
}