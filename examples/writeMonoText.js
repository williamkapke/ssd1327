const ssd1327 = require('ssd1327')
const font = require('../fonts/FreeMono24pt7b.js'); // you'll need to run convertAdafruitFont.js to get a font
const i2c = require('i2c-bus-promise') // NOT INCLUDED /W LIB - YOU MUST INSTALL!

i2c.open(1).then(async (bus) => {
  const oled = ssd1327.I2C(bus, 0x3D)
  await oled.writeMonoText('I2C FTW!', font, 3,50)
})

