// const Buffer = require('Buffer');

class DoubleWidthPixelMatrix {
  constructor(width, height) {
    if (width < 0 || width % 2) throw new Error('width must be an even positive number')
    this.width = width
    this.height = height
    this.segWidth = this.width / 2
    this.data = Buffer.alloc((width/2) * height)
  }

  set(x, y, color) {
    if (y > this.height || x > this.width) return // ignore out of bounds pixels

    const seg = Math.floor(x / 2)
    const odd = x % 2
    if (!odd) {
      color = color<<4
    } else {
      color &= 0x0F // remove any upper bits that may exist
    }

    const idx = (y * this.segWidth) + seg
    const segment = this.data[idx]

    const mask = odd ? 0xF0 : 0x0F
    const masked = segment & mask // remove uninterested party
    const result = masked | color

    if (result === segment) return false // no update

    this.data[idx] = result
    return true
  }

  setRange(x1, y1, x2, y2, color) {
    if (x1 > x2 || y1 > y2 || x2 >= this.width || y2 >= this.height) {
      throw new Error('Invalid range')
    }

    color &= 0x0F // remove any upper bits that may exist

    const view = this.view(x1, y1, x2, y2)
    const oddStart = x1 % 2 //starts with an odd column number
    const evenEnd = !(x2 % 2) //ends with an even column number
    let any = false

    // handle 1/2 segment updates...
    if (oddStart) {
      for (let y = y1; y <= y2; y++) {
        if(this.set(x1, y, color)) any = true
      }
      x1++;
      if (x1 > x2) return view //single column update
    }

    if (evenEnd) {
      for (let y = y1; y <= y2; y++) {
        if(this.set(x2, y, color)) any = true
      }
      x2--;
      if (x1 >= x2) return view //single column update
    }

    const startSeg = Math.floor(x1 / 2)
    const endSeg = Math.floor(x2 / 2)
    // now fill in the center with full seg updates
    const doubleWideColor = (color<<4)|color
    for (let y = y1; y <= y2; y++) {
      for (let seg = startSeg; seg <= endSeg; seg++) {
        const idx = (y * this.segWidth) + seg
        if (this.data[idx] !== doubleWideColor) {
          this.data[idx] = doubleWideColor
          any = true
        }
      }
    }
    if (any) {
      return view
    }
  }

  bitmap(x1, y1, width, height, buff) {
    let any = false
    let x2 = x1 + width
    let y2 = y1 + height
    const view = this.view(x1, y1, x2, y2)

    //iterate the bits
    for (let i = 0; i < buff.length; i++) {
      let byte = buff[i];
      for (let mask = 0x80; mask > 0x00 && y1 < y2; mask = mask>>>1) {
        const bit = (byte & mask) === mask
        if(this.set(x1, y1, bit ? 0xF : 0x0)) any = true
        if (++x1 === x2) {
          x1 = x2 - width, y1++;
        }
      }
    }
    if (any) {
      return view
    }
  }

  apply(startSeg, y, sourceMatrix) {
    // calculate the index where this matrix will be applied in the target (aka: this)
    const originIndex = (y * this.segWidth) + startSeg
    let updates = 0

    for (let row = 0; row < sourceMatrix.height; row++) {
      const sourceRowStartIndex = row * sourceMatrix.segWidth
      const destinationRowStartIndex = originIndex + (row * this.segWidth)

      for (let seg = 0; seg < sourceMatrix.segWidth; seg++) {
        if ( startSeg + seg > this.segWidth - 1) continue // clip horizontal overflow
        const existingSeg = this.data[destinationRowStartIndex + seg]
        const newSeg = sourceMatrix.data[sourceRowStartIndex + seg]

        if (existingSeg !== newSeg) {
          this.data[destinationRowStartIndex + seg] = newSeg
          updates++
        }
      }
    }
    return updates
  }

  clear(color = 0x0) {
    this.data.fill(color)
  }

  view(x1, y1, x2, y2) {
    if (x1 >= this.width || y1 > this.height || y2 > this.height) {
      throw new Error('Invalid range')
    }
    const startSeg = Math.floor(x1 / 2)
    let endSeg = Math.min(Math.floor(x2 / 2), this.segWidth)
    const segWidth = endSeg - startSeg + 1
    const height = y2 - y1 + 1
    const length = segWidth * height

    const p = new Proxy(this.data, {
      get: (target, name) => {
        switch(name) {
          case 'length': return length
          case 'seg': return {start:startSeg,end:endSeg}
          case 'com': return {start:y1,end:y2}
          case 'get': return get
          default:
            if (typeof name === 'symbol' || !/^\d+$/.test(name)) {
              return target[name]
            }
            name = Number(name)
        }

        // index access- map to source data...
        const com = Math.floor(name / segWidth)
        const seg = name % segWidth

        const sourceRow = y1 + com
        const sourceSeg = startSeg + seg
        const sourceIdx = (sourceRow * this.segWidth) + sourceSeg
        if (sourceIdx > target.length) {
          console.error('out of range index requested:', name, sourceIdx)
        }
        return target[sourceIdx]
      }
    })
    return p
  }
}
const hex = (x) => x.toString(16).padStart(2,'0')
const bin = (x) => x.toString(2).padStart(8,'0')
// const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t));

module.exports = DoubleWidthPixelMatrix
