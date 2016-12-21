var events = require('events');
var util = require('util');

var I2C = require('./i2c');

var BUTTON_REGISTER       = 0x4a;
var INT_TEMP_MSB_REGISTER = 0x5e;
var INT_TEMP_LSB_REGISTER = 0x5f;
var BAT_VOLT_MSB_REGISTER = 0x78;
var BAT_VOLT_LSB_REGISTER = 0x79;
var BAT_ADC_REGISTER      = 0x82;
var GPIO2_REGISTER        = 0x93;

function AXP209(bus, address) {
  this._i2c = new I2C(bus, address);

  this._reads = {};
  
}

util.inherits(AXP209, events.EventEmitter);

AXP209.prototype.open = function() {
  this._i2c.open();
  
  this._configureVcc18Adc();
  //this._resetVcc18();
};

AXP209.prototype.pinMode = function(pin, mode) {
  if (pin === 'BAT') {
    this._configureBatAdc();
  }
  if (pin === 'VCC-1V8' && mode === 2) {
      this._configureVcc18Adc();
  }
};

AXP209.prototype.analogRead = function(pin) {
  this._reads[pin] = true;
};

AXP209.prototype.digitalWrite = function(pin, value) {
  if (pin === 'STATUS') {
    this._writeGpio2(value);
  }
};

AXP209.prototype.digitalRead = function(pin) {
  this._reads[pin] = true;
};

AXP209.prototype.tick = function() {
  if (this._reads.BAT) {
    var batVolt = this._readBatVolt();

    this.emit('analog-read', 'BAT', batVolt);
  }

  if (this._reads.INTTEMP) {
    var intTemp = this._readIntTemp();

    this.emit('analog-read', 'INTTEMP', intTemp);
  }

  if (this._reads.BTN) {
    var button = this._readButton();

    this.emit('digital-read', 'BTN', button);
  }
  
  if (this._reads['VCC-1V8']) {
    var vcc1v8AdcVolt = this._readVcc18Adc();

    this.emit('analog-read', 'VCC-1V8', vcc1v8AdcVolt);
  }
};

AXP209.prototype.close = function() {
  this._i2c.close();
};

AXP209.prototype._readIntTemp = function() {
  return this._readAdc(INT_TEMP_MSB_REGISTER, INT_TEMP_LSB_REGISTER);
};

AXP209.prototype._readBatVolt = function() {
  return this._readAdc(BAT_VOLT_MSB_REGISTER, BAT_VOLT_LSB_REGISTER);
};

AXP209.prototype._readButton = function() {
  var value = (this._i2c.readRegister(BUTTON_REGISTER, 1)[0] & 0x02) !== 0;

  if (value) {
    this._i2c.writeRegister(BUTTON_REGISTER, new Buffer([0x02]));
  }

  return (value ? 1 : 0);
};

AXP209.prototype._readVcc18Adc = function() {
  // enable 12-bit ADC for VCC 1.8 
  var p = this._i2c.readRegister(0x85, 1)[0]; // 0-2v range or .7 - 2.7v range?
  var rhigh = this._i2c.readRegister(0x64, 1)[0].toString(16);
  var rlow = this._i2c.readRegister(0x65, 1)[0].toString(16);
  var r = parseInt(rhigh + rlow, 16);
  
  var voltage = (((r * 10000)/4096) * 2) + (p * 7000); // voltage in millivolts
  
  return voltage;
};

AXP209.prototype._configureBatAdc = function() {
  // force ADC enable for battery voltage and current
  return this._i2c.writeRegister(BAT_ADC_REGISTER, new Buffer([0xc3]));
};

AXP209.prototype._configureVcc18Adc = function() {
  // force enable 12-bit ADC for VCC 1.8 
  this._i2c.writeRegister(0x83, new Buffer([0x80])); // disable ADC input on GPIO0
  this._i2c.writeRegister(0x90, new Buffer([0x04])); // set GPIO0 to 12 bit ADC input
  this._i2c.writeRegister(0x85, new Buffer([0x00])); // use 0x01 for ADC input range 0.7-2.7475v
  this._i2c.writeRegister(0x83, new Buffer([0x88])); // enable ADC input on GPIO0
};

AXP209.prototype._resetVcc18 = function() {
  // reset VCC 1.8 to normal operation
  this._i2c.writeRegister(0x83, new Buffer([0x80])); // disable ADC input on GPIO0
  this._i2c.writeRegister(0x90, new Buffer([0x03])); 
  this._i2c.writeRegister(0x91, new Buffer([0x00])); // output voltage = 1.8v + high_4_bit(0x91) * 0.1v
};

AXP209.prototype._writeGpio2 = function(value) {
  this._i2c.writeRegister(GPIO2_REGISTER, new Buffer([value]));
};

AXP209.prototype._readAdc = function(msbRegister, lsbRegister) {
  msbData = this._i2c.readRegister(msbRegister, 1);
  lsbData = this._i2c.readRegister(lsbRegister, 1);

  return ((msbData[0] << 4) | (lsbData[0] & 0x0f));
};

module.exports = AXP209;
