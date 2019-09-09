# SSD1327
This Node.js library talks to a ssd1327 OLED device.

```js
const SSD1327 = require('ssd1327')
const font = require('../fonts/FreeMono24pt7b.js'); // you'll need to run convertAdafruitFont.js to get a font
const i2c = require('i2c-bus-promise') // NOT INCLUDED /W LIB - YOU MUST INSTALL!

i2c.open(1).then(async (bus) => {
  const oled = SSD1327.i2c(bus, 0x3D)
  await oled.writeMonoText('I2C!', font, 3,50) //
})
```

## Install

```
npm install ssd1327
```

## BYO[protocol]
Since you can communicate with an ssd1327 with I2C _or_ SPI- I've opted to leave the communication protocol
libraries out to keep from installing extra cruft that isn't needed.

This means **you will need to install the [i2c-bus](https://www.npmjs.com/package/i2c-bus) or
[spi-device](https://www.npmjs.com/package/spi-device) independently**.

## i2c-bus-promise
```
npm install i2c-bus-promise
```
This library is **async** (Promise) based. The [i2c-bus](https://www.npmjs.com/package/i2c-bus) is not. The
[i2c-bus-promise](https://www.npmjs.com/package/i2c-bus-promise) library is just a promise wrapper for it.

You should be able to reuse an existing instance of [i2c-bus](https://www.npmjs.com/package/i2c-bus) if you
already have one installed.

## SPI
// TODO. Sorry!

## Coordinates
x/y positions start in the upper left corner and continue **positively** down and to the right.

**Top-Left:** 0,0<br>
**Bottom-Right:** 127,127

## Interface

All functions return a Promise.

**DON'T FORGET TO `await` (or use `.then()`)!!**

### i2c(bus, address)
Creates an I2C SSD1327 instance.

**returns** a Promise with the SSD1327 instance.

### spi
// TODO

### writeMonoText(text, font, x = 0, y = 0)
Writes text to the display at the x/y pixel coordinates. Monospace fonts only.

### on() off()
Turns the display on or off.

### clear(color=0x0)
Sets every pixel on the display to the specified color.

.. and by "color" we mean a shade of grey from 0x0 (black) to 0xF (white)

This function uses specific optimizations to improve performance (compared to `fill()`).

### dimmed(yes=true)
Dims the display.

### fill(x1, y1, x2, y2, color)
Fills the area withing the x/y pixels with the specified color.

.. and by "color" we mean a shade of grey from 0x0 (black) to 0xF (white)

A horizontal or vertical lines can be drawn using a 1 pixel wide fill.

### bitmap(x, y, width, height, buff)
Turns pixels on/off using a Buffer whos individual bits indicate
a pixel's on or off state.

Starting at the x/y position, it draws `width` pixels from left to right, top-down until the end of the buffer
is reached.

# License
MIT
