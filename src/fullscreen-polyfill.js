/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */
const spec = [
  'fullscreen',
  'fullscreenEnabled',
  'fullscreenElement',
  'fullscreenchange',
  'fullscreenerror',
  'exitFullscreen',
  'requestFullscreen',
]

const webkit = [
  'webkitIsFullScreen',
  'webkitFullscreenEnabled',
  'webkitFullscreenElement',
  'webkitfullscreenchange',
  'webkitfullscreenerror',
  'webkitExitFullscreen',
  'webkitRequestFullscreen',
]

const moz = [
  'mozFullScreen',
  'mozFullScreenEnabled',
  'mozFullScreenElement',
  'mozfullscreenchange',
  'mozfullscreenerror',
  'mozCancelFullScreen',
  'mozRequestFullScreen',
]

const ms = [
  '',
  'msFullscreenEnabled',
  'msFullscreenElement',
  'MSFullscreenChange',
  'MSFullscreenError',
  'msExitFullscreen',
  'msRequestFullscreen',
]

function getFullscreenApi() {
  const fullscreenEnabled = [spec[1], webkit[1], moz[1], ms[1]].find(prefix => document[prefix])
  return (
    [spec, webkit, moz, ms].find(vendor => {
      return vendor.find(prefix => prefix === fullscreenEnabled)
    }) || []
  )
}

// Get the vendor fullscreen prefixed api
let fsVendorKeywords = []

function handleEvent(eventType, event) {
  document[spec[0]] = document[fsVendorKeywords[0]] || !!document[fsVendorKeywords[2]] || false
  document[spec[1]] = document[fsVendorKeywords[1]] || false
  document[spec[2]] = document[fsVendorKeywords[2]] || null
  const evt = new Event(eventType, {
    cancelable: false,
    bubbles: true,
  })

  event.target.dispatchEvent(evt)
}

function setupShim() {
  // fullscreen
  // Defaults to false for cases like MS where they do not have this
  // attribute. Another way to check whether fullscreen is active is to look
  // at the fullscreenElement attribute.
  document[spec[0]] = document[fsVendorKeywords[0]] || !!document[fsVendorKeywords[2]] || false

  // fullscreenEnabled
  document[spec[1]] = document[fsVendorKeywords[1]] || false

  // fullscreenElement
  document[spec[2]] = document[fsVendorKeywords[2]] || null

  // onfullscreenchange
  document.addEventListener(fsVendorKeywords[3], handleEvent.bind(document, spec[3]), false)

  // onfullscreenerror
  document.addEventListener(fsVendorKeywords[4], handleEvent.bind(document, spec[4]), false)

  // exitFullscreen
  document[spec[5]] = function () {
    return document[fsVendorKeywords[5]]()
  }

  // requestFullscreen
  Element.prototype[spec[6]] = function () {
    return this[fsVendorKeywords[6]].apply(this, arguments)
  }
}

if (typeof document !== 'undefined') {
  fsVendorKeywords = getFullscreenApi()
  // Don't polyfill if it already exist
  document[spec[1]] || setupShim()
}

export default {}
