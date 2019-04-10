/**
 * A wrapper around the Fontsampler interface
 * 
 * 
 * Generally, the DOM is structured in such a way:
 * 
 * Each nested Array in ´order´ is enclosed in a
 * 
 * .fsjs-wrapper
 * 
 * In each (optional, e.g. without Array straight output) wrapper one more more:
 * 
 *  [data-fsjs-block=_property_].fsjs-block .fsjs-block-_property_ .fsjs-block-type-_type_
 * 
 * Nested in each block a variety of sub elements:
 *      Optional label with:
 *      [data-fsjs-for=_property_].fsjs-label
 *          [data-label-text=_property_].fsjs-label-text
 *          [data-label-value=_property_].fsjs-label-value (optional)
 *          [data-label-unit=_property_].fsjs-label-unit (optional)
 * 
 *      The actual ui control (input, select, buttongroup)
 *      [data-fsjs=_property_].fsjs-element-_property_
 * 
 */
var selection = require("./selection")

var UIElements = require("./uielements")

var helpers = require("./helpers")
var errors = require("./errors")
var events = require("./events")

function UI(root, fonts, options) {

    var ui = {
            tester: "textfield",
            fontsize: "slider",
            lineheight: "slider",
            letterspacing: "slider",
            fontfamily: "dropdown",
            alignment: "buttongroup",
            direction: "buttongroup",
            language: "dropdown",
            opentype: "checkboxes",
            variation: "slidergroup"
        },
        keyToCss = {
            "fontsize": "fontSize",
            "lineheight": "lineHeight",
            "letterspacing": "letterSpacing"
        },
        blocks = {},
        uifactory = null,
        input = null,
        originalText = ""

    function init() {
        console.debug("Fontsampler.Interface.init()", root, fonts, options)

        helpers.nodeAddClass(root, options.classes.rootClass)
        uifactory = UIElements(root, options)

        // The fontfamily is just being defined without the options, which
        // are the fonts passed in. let’s make this transformation behind
        // the scenes so we can use the re-usable "dropdown" ui by defining
        // the needed choices
        if (options.ui.fontfamily && typeof(options.ui.fontfamily) === "boolean") {
            options.ui.fontfamily = {}
        }
        options.ui.fontfamily.choices = fonts.map(function(value) {
            return value.name
        })

        // Before modifying the root node, detect if it is containing only
        // text, and if so, store it to the options for later use
        if (root.childNodes.length === 1 && root.childNodes[0].nodeType === Node.TEXT_NODE) {
            originalText = root.childNodes[0].textContent
            root.removeChild(root.childNodes[0])
        }
        options.originalText = originalText

        // Process the possible nested arrays in order one by one
        // · Existing DOM nodes will be validated and initiated
        // · UI elements defined via options but missing from the DOM will be created
        // · UI elements defined in ui option but not in order option will be 
        //   appended in the end
        // · Items neither in the DOM nor in options are skipped
        for (var i = 0; i < options.order.length; i++) {
            var elementA = parseOrder(options.order[i])
            if (helpers.isNode(elementA) && elementA.childNodes.length > 0 && !elementA.isConnected) {
                root.appendChild(elementA)
            }
        }

        input = getElement("tester", blocks.tester)

        // after all nodes are instantiated, update the tester to reflect
        // the current state
        for (var keyC in blocks) {
            if (blocks.hasOwnProperty(keyC)) {
                initBlock(keyC)
            }
        }

        // prevent line breaks on single line instances
        if (!options.multiline) {
            var typeEvents = ["keypress", "keyup", "change", "paste"]
            for (var e in typeEvents) {
                if (typeEvents.hasOwnProperty(e)) {
                    blocks.tester.addEventListener(typeEvents[e], onKey)
                }
            }
        }

        // prevent pasting styled content
        blocks.tester.addEventListener('paste', function(e) {
            e.preventDefault();
            var text = '';
            if (e.clipboardData || e.originalEvent.clipboardData) {
                text = (e.originalEvent || e).clipboardData.getData('text/plain');
            } else if (window.clipboardData) {
                text = window.clipboardData.getData('Text');
            }

            if (!options.multiline) {
                text = text.replace(/(?:\r\n|\r|\n|<br>)/g, ' ')
            }

            if (document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, text);
            } else {
                document.execCommand('paste', false, text);
            }
        });
    }

    /**
     * Recursively go through an element in the options.order
     * @param string key
     * @param node parent
     */
    function parseOrder(key) {
        var child, wrapper

        if (typeof(key) === "string") {
            var block = parseBlock(key)

            return block
        } else if (Array.isArray(key)) {
            wrapper = document.createElement("div")
            wrapper.className = options.classes.wrapperClass

            for (var i = 0; i < key.length; i++) {
                child = parseOrder(key[i])
                if (child) {
                    wrapper.appendChild(child)
                }
            }

            if (wrapper.children.length < 1) {
                return false
            }

            return wrapper
        } else {
            // Skipping not defined UI element

            return false
        }
    }

    /**
     * Parse an UI element from DOM or options
     * @param string item 
     * @return node || boolean (true = in DOM, false = invalid item)
     */
    function parseBlock(key) {
        if (key in ui === false) {
            throw new Error(errors.invalidUIItem + key)
        }

        var block = getBlock(key),
            element = false,
            label = false,
            opt = options.ui[key]

        if (block) {
            // if a block is found, try get its element and optional label
            element = getElement(key, block)
            label = getLabel(key, block)

            if (options.ui[key].label && !label) {
                // create a label if needed
                label = uifactory.label(opt.label, opt.unit, opt.init, key)
                block.appendChild(label)
                sanitizeLabel(label, key)
            } else if (label) {
                // or check the existing label
                sanitizeLabel(label, key)
            }
            if (!element) {
                // create and check the element
                element = createElement(key)
                block.appendChild(element)
                sanitizeElement(element, key)
            } else {
                // or check the existing element
                sanitizeElement(element, key)
            }

            // check the block itself
            sanitizeBlock(block, key)
            blocks[key] = block

            return false
        } else if (!block) {
            // for missing blocks that should get rendered create them
            block = createBlock(key)
            blocks[key] = block

            return block
        }

        return false
    }

    function createBlock(key) {
        var block = document.createElement("div"),
            element = createElement(key),
            label = false
        opt = options.ui[key]

        if (opt.label) {
            label = uifactory.label(opt.label, opt.unit, opt.init, key)
            block.append(label)
            sanitizeLabel(label, key)
        }

        block.append(element)
        sanitizeElement(element, key)

        sanitizeBlock(block, key)

        return block
    }

    function createElement(key) {
        var element = uifactory[ui[key]](key, options.ui[key])
        sanitizeElement(element, key)

        return element
    }

    function sanitizeBlock(block, key) {
        var classes = [
            options.classes.blockClass,
            options.classes.blockClass + "-" + key,
            options.classes.blockClass + "-type-" + ui[key]
        ]

        helpers.nodeAddClasses(block, classes)
        block.dataset.fsjsBlock = key
    }

    function sanitizeElement(element, key) {
        element = uifactory[ui[key]](key, options.ui[key], element)

        helpers.nodeAddClass(element, options.classes.elementClass)
        element.dataset.fsjs = key
    }

    function sanitizeLabel(label, key) {
        var text = label.querySelector("." + options.classes.labelTextClass),
            value = label.querySelector("." + options.classes.labelValueClass),
            unit = label.querySelector("." + options.classes.labelUnitClass),
            element = getElement(key)

        if (text && text.textContent === "") {
            text.textContent = options.ui[key].label
        }

        console.error(ui[key])
        if (["slider"].indexOf(ui[key]) === -1) {
            value.textContent = ""   
        }

        if (value && value.textContent === "") {
            // If set in already set in DOM the above validate will have set it
            value.textContent = element.value
        }

        if (unit && unit.textContent === "") {
            // If set in already set in DOM the above validate will have set it
            unit.textContent = element.dataset.unit
        }

        helpers.nodeAddClass(label, options.classes.labelClass)
        label.dataset.fsjsFor = key
    }

    /**
     * Init a UI element with values (update DOM to options)
     * @param node node 
     * @param object opt 
     * @return boolean
     */
    function initBlock(key) {
        // TODO set values if passed in and different on node
        var block = getBlock(key),
            element = getElement(key, block),
            type = ui[key],
            opt = options.ui[key]

        if (type === "slider") {
            element.addEventListener("change", onChange)
            element.addEventListener("change", onSlide)
            element.val = opt.init
            setInputCss(keyToCss[key], opt.init + opt.unit)
        } else if (type === "dropdown") {
            element.addEventListener("change", onChange)
            // TODO init values to tester
        } else if (type === "buttongroup") {
            var buttons = element.querySelectorAll("[data-choice]")

            if (buttons.length > 0) {
                for (var b = 0; b < buttons.length; b++) {
                    buttons[b].addEventListener("click", onClick)
                    if (buttons[b].dataset.choice === options.ui[key].init) {
                        helpers.nodeAddClass(buttons[b], options.classes.buttonSelectedClass)
                    } else {
                        helpers.nodeRemoveClass(buttons[b], options.classes.buttonSelectedClass)
                    }
                }
            }
        } else if (type === "checkboxes") {
            // currently only opentype feature checkboxes
            var checkboxes = element.querySelectorAll("[data-feature]")
            if (checkboxes.length > 0) {
                var features = {}
                for (var c = 0; c < checkboxes.length; c++) {
                    var checkbox = checkboxes[c]
                    checkbox.addEventListener("change", onCheck)
                    if ("features" in checkbox.dataset) {
                        features[checkbox.dataset.features] = checkbox.checked ? "1" : "0"
                    }
                }
                setInputOpentype(features)
            }
        } else if (type === "slidergroup") {
            // currently only variable font slider group
            var nestedDropdown = element.querySelector("[data-fsjs='instances']")
            if (nestedDropdown) {
                nestedDropdown.addEventListener("change", function(e) {
                    var axes = e.target.value.split(",")
                    for (var v = 0; v < axes.length; v++) {
                        var axis = axes[v].split(" "),
                            slider = element.querySelector("[data-fsjs-slider][data-axis='" + axis[0] + "']")

                        if (!isValidAxisAndValue(axis[0], axis[1])) {
                            console.warn(axis)
                            console.warn(errors.invalidVariation)
                            continue
                        }

                        slider.value = axis[1]

                        // manually trigger a HTMLEvents.change to propagate the changes
                        sendNativeEvent("change", slider)
                        sendEvent("variation")
                    }
                })
            }

            var nestedSliders = element.querySelectorAll("[data-fsjs-slider]")
            if (nestedSliders && nestedSliders.length > 0) {
                for (var a = 0; a < nestedSliders.length; a++) {
                    var nestedSlider = nestedSliders[a]
                    nestedSlider.addEventListener("change", function(e) {
                        sendEvent(e.target.parentNode.dataset.fsjs)
                    })
                    nestedSlider.addEventListener("change", function(e) {
                        refreshAxisLabelValue(e.target.dataset.axis)
                    })
                }
            }
        }

        return true
    }

    function isValidAxisAndValue(axis, value) {
        if (!Array.isArray(options.ui.variation.axes)) {
            return false
        }

        for (var a = 0; a < options.ui.variation.axes.length; a++) {
            var axisoptions = options.ui.variation.axes[a]
            if (axisoptions.code !== axis) {
                continue
            }
            if (value < axisoptions.min || value > axisoptions.max) {
                return false
            } else {
                return true
            }
        }
    }

    function refreshAxisLabelValue(axis) {
        var label = root.querySelector("[data-fsjs-for='" + axis + "'] .fsjs-label-value")
        if (label) {
            label.textContent = getVariation(axis)
        }
    }

    function getElement(key, node) {
        if (typeof(node) === "undefined") {
            node = root
        }
        var element = root.querySelector("[data-fsjs='" + key + "']")

        return helpers.isNode(element) ? element : false
    }

    function getBlock(key, node) {
        if (typeof(node) === "undefined") {
            node = root
        }
        var block = root.querySelector("[data-fsjs-block='" + key + "']")

        return helpers.isNode(block) ? block : false
    }

    function getLabel(key, node) {
        if (typeof(node) === "undefined") {
            node = root
        }
        var block = root.querySelector("[data-fsjs-for='" + key + "']")

        return helpers.isNode(block) ? block : false
    }

    /**
     * Catch-all UI element event listener firing a scoped CustomEvent based
     * on the element’s property
     * @param {*} e 
     */
    function onChange(e) {
        var key = e.target.dataset.fsjs

        sendEvent(key)
    }

    function onSlide(e) {
        var key = e.target.dataset.fsjs,
            label = root.querySelector("[data-fsjs-for='" + key + "'] .fsjs-label-value")

        if (label) {
            label.textContent = getValue(key)
        }
    }

    function onCheck() {
        // Currently this is only used for opentype checkboxes
        var key = "opentype"

        sendEvent(key)
    }

    /**
     * Currently only reacting to buttongroup nested buttons’ clicks
     * @param {*} e 
     */
    function onClick(e) {
        var parent = e.currentTarget.parentNode,
            property = parent.dataset.fsjs,
            buttons = parent.querySelectorAll("[data-choice]")

        if (property in ui && ui[property] === "buttongroup") {
            for (var b = 0; b < buttons.length; b++) {
                helpers.nodeRemoveClass(buttons[b], options.classes.buttonSelectedClass)
            }
            helpers.nodeAddClass(e.currentTarget, options.classes.buttonSelectedClass)

            sendEvent(property)
        }
    }

    function sendEvent(type) {
        root.dispatchEvent(new CustomEvent("fontsampler.on" + type + "changed"))
    }

    function sendNativeEvent(type, node) {
        var evt = document.createEvent("HTMLEvents")

        evt.initEvent(type, false, true)
        node.dispatchEvent(evt)
    }

    function onKey(event) {
        if (event.type === "keypress") {
            // for keypress events immediately block pressing enter for line break
            if (event.keyCode === 13) {
                event.preventDefault()
                return false;
            }
        } else {
            // allow other events, filter any html with $.text() and replace linebreaks
            // TODO fix paste event from setting the caret to the front of the non-input non-textarea
            var text = blocks.tester.textContent,
                hasLinebreaks = text.indexOf("\n")

            if (-1 !== hasLinebreaks) {
                blocks.tester.innerHTML(text.replace('/\n/gi', ''));
                selection.setCaret(blocks.tester, blocks.tester.textContent.length, 0);
            }
        }
    }

    /**
     * Get a UI element value
     * @param {*} property 
     */
    function getValue(property) {
        var element = getElement(property)

        if (element) {
            return element.value
        } else {
            return false
        }
    }

    /**
     * Get a UI element value with CSS unit
     * @param {*} property 
     */
    function getCssValue(property) {
        var element = getElement(property)

        return element ? element.value + element.dataset.unit : ""
    }

    function getOpentype() {
        if (!blocks.opentype) {
            return false
        }

        var features = blocks.opentype.querySelectorAll("[data-feature]")

        if (features) {
            var re = {}

            for (var f = 0; f < features.length; f++) {
                var input = features[f]
                re[input.dataset.feature] = input.checked
            }

            return re
        }
    }

    /**
     * Return the current variation settings as object
     * 
     * If Axis is passed, only that axis’ numerical value is returned
     * @param {*} axis 
     */
    function getVariation(axis) {
        if (!blocks.variation) {
            return false
        }

        var variations = blocks.variation.querySelectorAll("[data-axis]"),
            input,
            va = {}

        if (variations) {
            for (var v = 0; v < variations.length; v++) {
                input = variations[v]
                va[input.dataset.axis] = input.value
            }
        }

        if (typeof(axis) === "string" && axis in va) {
            return va[axis]
        }

        return va
    }

    function getButtongroupValue(key) {
        var element = getElement(key),
            selected

        if (element) {
            selected = element.querySelector("." + options.classes.buttonSelectedClass)
        }

        if (selected) {
            return selected.dataset.choice
        } else {
            return ""
        }
    }

    function getCssAttrForKey(key) {
        if (key in keyToCss) {
            return keyToCss[key]
        }

        return false
    }

    function getKeyForCssAttr(attr) {
        for (var key in keyToCss) {
            if (keyToCss.hasOwnProperty(key)) {
                if (keyToCss[key] === attr) {
                    return key
                }
            }
        }

        return false
    }

    /**
     * Set the tester’s text
     * @param {*} attr 
     * @param {*} val 
     */
    function setInputCss(attr, val) {
        input.style[attr] = val
    }

    function setInputAttr(attr, val) {
        input.setAttribute(attr, val)
    }

    function setInputOpentype(features) {
        var parsed = [],
            val
        for (var key in features) {
            if (features.hasOwnProperty(key) && key && typeof(key) !== "undefined") {
                parsed.push('"' + key + '" ' + (features[key] ? "1" : "0"))
            }
        }
        val = parsed.join(",")

        input.style["font-feature-settings"] = val
    }

    function setInputVariation(variations) {
        var parsed = []
        for (var key in variations) {
            if (variations.hasOwnProperty(key) && key && typeof(key) !== "undefined") {
                parsed.push('"' + key + '" ' + (variations[key]))
            }
        }
        val = parsed.join(",")

        input.style["font-variation-settings"] = val
    }

    function setActiveAxes(axes) {
        var sliders = getBlock("variation").querySelectorAll("[data-axis]")
        if (sliders) {
            for (var s = 0; s < sliders.length; s++) {
                if (!Array.isArray(axes) || axes.length < 1 || axes.indexOf(sliders[s].dataset.axis) === -1) {
                    helpers.nodeAddClass(sliders[s].parentNode, "fsjs-slider-inactive")
                } else {
                    helpers.nodeRemoveClass(sliders[s].parentNode, "fsjs-slider-inactive")
                }
            }
        }
    }

    function setActivateLanguage(lang) {
        var dropdown = getElement("language")

        if (dropdown && typeof(lang) === "string") {
            var languageChoices = options.ui.language.choices.map(function (value) {
                return value.split("|")[0]
            })
            if (languageChoices.lang !== -1) {
                dropdown.value = lang
                dropdown.querySelector("option[value='" + lang + "']").selected = true
                sendNativeEvent("change", dropdown)
                root.dispatchEvent(new CustomEvent(events.languageChanged))
            }
        }
    }

    function setActiveOpentype(features) {
        var block = getBlock("opentype")
            checkboxes = false
            
        if (block) {
            checkboxes = block.querySelectorAll("[data-feature]")
        }
        if (checkboxes) {
            for (var c = 0; c < checkboxes.length; c++) {
                if (Array.isArray(features)) {
                    if (features.indexOf(checkboxes[c].dataset.feature) === -1) {
                        helpers.nodeAddClass(checkboxes[c].parentNode, "fsjs-checkbox-inactive")
                    } else {
                        helpers.nodeRemoveClass(checkboxes[c].parentNode, "fsjs-checkbox-inactive")
                    }
                } else {
                    helpers.nodeRemoveClass(checkboxes[c].parentNode, "fsjs-checkbox-inactive")        
                }
            }
        }
    }

    function setInputText(text) {
        if (text && input) {
            input.textContent = text
        }
    }

    function setLabelValue(key, value) {
        var labelValue = root.querySelector("[data-fsjs-for='" + key + "'] ." + options.classes.labelValueClass)

        if (labelValue) {
            labelValue.textContent = value
        }
    }

    function setStatusClass(classString, status) {
        if (status === true) {
            helpers.nodeAddClass(root, classString)
        } else if (status === false) {
            helpers.nodeRemoveClass(root, classString)
        }
    }

    return {
        init: init,
        getValue: getValue,
        getCssValue: getCssValue,
        getButtongroupValue: getButtongroupValue,
        getOpentype: getOpentype,
        getVariation: getVariation,
        getCssAttrForKey: getCssAttrForKey,
        getKeyForCssAttr: getKeyForCssAttr,
        setInputCss: setInputCss,
        setInputAttr: setInputAttr,
        setInputOpentype: setInputOpentype,
        setInputVariation: setInputVariation,
        setInputText: setInputText,
        setStatusClass: setStatusClass,
        setActiveAxes: setActiveAxes,
        setActivateLanguage: setActivateLanguage,
        setActiveOpentype: setActiveOpentype,
        setLabelValue: setLabelValue,

        sendEvent: sendEvent,
        sendNativeEvent: sendNativeEvent
    }
}
module.exports = UI