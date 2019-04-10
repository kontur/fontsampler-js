var rangeSlider = require("../node_modules/rangeslider-pure/dist/range-slider")
var Dropkick = require("../node_modules/dropkickjs/dist/dropkick").default
var events = require("./events")
var helpers = require("./helpers")

function Skin(FS) {

    FS.registerEventhandler(events.init, init)

    function init() {
        console.debug("Skin.init()", FS, FS.initialized)

        if (FS.initialized === true) {
            console.error(FS.root)
            throw new Error("FontsamplerSkin: Cannot apply skin to a Fontsampler that is already initialized.")
        }

        helpers.nodeAddClass(FS.root, "fsjs-skin")

        var rangeInputs = FS.root.querySelectorAll("input[type=range][data-fsjs-slider]")
        if (rangeInputs.length) {
            rangeSlider.create(rangeInputs, {
                polyfill: true,
                // utilise the more granular events offered by the skin
                // default html range inputs only trigger on change
                onSlide: updateSlider,
                onSlideEnd: updateSlider
            })
        }

        var selectInputs = FS.root.querySelectorAll("select[data-fsjs]")
        var dropdowns = []
        if (selectInputs.length) {
            for (var i in selectInputs) {
                if (selectInputs.hasOwnProperty(i)) {
                    dropdowns.push(new Dropkick(selectInputs[i], {
                        mobile: true
                    }))
                }
            }
        }
        FS.registerEventhandler(events.languageChanged, function (e) {
            var languageDropdown = FS.root.querySelector("select[data-fsjs='language']")
            if (languageDropdown && dropdowns) {
                for (var d = 0; d < dropdowns.length; d++) {
                    var dropdown = dropdowns[d]
                    if (dropdown.sel, dropdown.sel === languageDropdown) {
                        dropdown.select(languageDropdown.value)
                    }
                }
            }
        })
    }

    function updateSlider(position /*, value*/ ) {
        var key = this.element.dataset.fsjs,
            eventKey = key,
            label

        // Catch special case for variable font axis sliders
        if (typeof(key) === "undefined") {
            key = this.element.dataset.axis
            eventKey = "variation"
        }

        console.log("update slider")

        label = FS.root.querySelector("[data-fsjs-for='" + key + "'] .fsjs-label-value")

        FS.root.dispatchEvent(new CustomEvent("fontsampler.on" + eventKey + "changed"))

        if (label) {
            label.textContent = position
        }
    }

}

module.exports = Skin