import moment from "../../module/moment.js";
import util from "../../util.js";
import * as DateUtil from "../DateUtil.js";
import TimeStep from "../TimeStep.js";
import Component from "./Component.js";

/** A horizontal time axis */
class TimeAxis extends Component {
  /**
   * @param {{dom: Object, domProps: Object, emitter: Emitter, range: Range}} body
   * @param {Object} [options]        See TimeAxis.setOptions for the available
   *                                  options.
   * @constructor TimeAxis
   * @extends Component
   */
  constructor(body, options) {
    super();
    this.dom = {
      foreground: null,
      lines: [],
      majorTexts: [],
      minorTexts: [],
      redundant: {
        lines: [],
        majorTexts: [],
        minorTexts: [],
      },
    };
    this.props = {
      range: {
        start: 0,
        end: 0,
        minimumStep: 0,
      },
      lineTop: 0,
    };

    this.defaultOptions = {
      orientation: {
        axis: "bottom",
      }, // axis orientation: 'top' or 'bottom'
      showMinorLabels: true,
      showMajorLabels: true,
      showWeekScale: false,
      maxMinorChars: 7,
      format: util.extend({}, TimeStep.FORMAT),
      moment,
      timeAxis: null,
    };
    this.options = util.extend({}, this.defaultOptions);

    this.body = body;

    // create the HTML DOM
    this._create();

    this.setOptions(options);
  }

  /**
   * Set options for the TimeAxis.
   * Parameters will be merged in current options.
   * @param {Object} options  Available options:
   *                          {string} [orientation.axis]
   *                          {boolean} [showMinorLabels]
   *                          {boolean} [showMajorLabels]
   *                          {boolean} [showWeekScale]
   */
  setOptions(options) {
    if (options) {
      // copy all options that we know
      util.selectiveExtend(
        [
          "showMinorLabels",
          "showMajorLabels",
          "showWeekScale",
          "maxMinorChars",
          "hiddenDates",
          "timeAxis",
          "moment",
          "rtl",
        ],
        this.options,
        options,
      );

      // deep copy the format options
      util.selectiveDeepExtend(["format"], this.options, options);

      if ("orientation" in options) {
        if (typeof options.orientation === "string") {
          this.options.orientation.axis = options.orientation;
        } else if (
          typeof options.orientation === "object" &&
          "axis" in options.orientation
        ) {
          this.options.orientation.axis = options.orientation.axis;
        }
      }

      // apply locale to moment.js
      // TODO: not so nice, this is applied globally to moment.js
      if ("locale" in options) {
        if (typeof moment.locale === "function") {
          // moment.js 2.8.1+
          moment.locale(options.locale);
        } else {
          moment.lang(options.locale);
        }
      }

      // options can change the label format/formatting timezone: the
      // painted axis is stale, repaint on the next redraw
      this._axisEpoch = null;
    }
  }

  /**
   * Create the HTML DOM for the TimeAxis
   */
  _create() {
    this.dom.foreground = document.createElement("div");
    this.dom.background = document.createElement("div");
    this.dom.foregroundContent = document.createElement("div");
    this.dom.backgroundContent = document.createElement("div");

    this.dom.foreground.className = "vis-time-axis vis-foreground";
    this.dom.background.className = "vis-time-axis vis-background";

    // Keep the clipping containers fixed and pan inner layers. Transforming
    // an overflow-hidden container moves its clipping rectangle too, leaving
    // an empty strip at the viewport edge even when overscan was painted.
    for (const content of [
      this.dom.foregroundContent,
      this.dom.backgroundContent,
    ]) {
      content.style.position = "absolute";
      content.style.top = "0";
      content.style.left = "0";
      content.style.width = "100%";
      content.style.height = "100%";
    }
    this.dom.foreground.appendChild(this.dom.foregroundContent);
    this.dom.background.appendChild(this.dom.backgroundContent);
  }

  /**
   * Destroy the TimeAxis
   */
  destroy() {
    // remove from DOM
    if (this.dom.foreground.parentNode) {
      this.dom.foreground.parentNode.removeChild(this.dom.foreground);
    }
    if (this.dom.background.parentNode) {
      this.dom.background.parentNode.removeChild(this.dom.background);
    }

    this.body = null;
  }

  /**
   * Repaint the component
   * @return {boolean} Returns true if the component is resized
   */
  redraw() {
    const props = this.props;
    const foreground = this.dom.foreground;
    const background = this.dom.background;

    // determine the correct parent DOM element (depending on option orientation)
    const parent =
      this.options.orientation.axis == "top"
        ? this.body.dom.top
        : this.body.dom.bottom;
    const parentChanged = foreground.parentNode !== parent;

    const showMinorLabels =
      this.options.showMinorLabels && this.options.orientation.axis !== "none";
    const showMajorLabels =
      this.options.showMajorLabels && this.options.orientation.axis !== "none";

    // Pan fast path: while the zoom scale is unchanged, panning is a pure
    // translation of the axis. Labels and grid lines were painted over one
    // extra viewport width on each side (see _repaintLabels), so as long as
    // the pan stays within that window the whole repaint - step iteration,
    // label formatting, innerHTML writes, char measurement, and the
    // detach/reattach of the axis DOM (which dirtied layout for every
    // component redrawn after the axis, every frame) - can be replaced by
    // one transform write. Sizes below are derived from cached values only.
    const range = this.body.range;
    const span = range.end - range.start;
    const centerWidth = this.body.domProps.center.width;
    const scale = span > 0 ? centerWidth / span : 0;
    const epochUsable =
      !this.options.rtl &&
      !(this.body.hiddenDates && this.body.hiddenDates.length > 0) &&
      scale > 0 &&
      !parentChanged;

    // the painted labels carry date-dependent classes (vis-today etc.), so
    // an epoch is only trusted for a bounded time on an otherwise idle axis
    const AXIS_EPOCH_TTL = 10 * 60 * 1000;
    if (
      epochUsable &&
      this._axisEpoch &&
      this._axisEpoch.scale === scale &&
      Date.now() - this._axisEpoch.paintedAt < AXIS_EPOCH_TTL
    ) {
      const minorLabelHeight = showMinorLabels ? props.minorCharHeight : 0;
      const majorLabelHeight = showMajorLabels ? props.majorCharHeight : 0;
      const minorLineHeight =
        this.body.domProps.root.height -
        majorLabelHeight -
        (this.options.orientation.axis == "top"
          ? this.body.domProps.bottom.height
          : this.body.domProps.top.height);
      const panOffsetPx = (range.start - this._axisEpoch.start) * scale;
      if (
        Math.abs(panOffsetPx) <= centerWidth &&
        minorLabelHeight === props.minorLabelHeight &&
        majorLabelHeight === props.majorLabelHeight &&
        minorLineHeight === props.minorLineHeight
      ) {
        this._applyAxisPan(panOffsetPx);
        return false;
      }
    }

    // full repaint

    // calculate character width and height
    this._calculateCharSize();

    // determine the width and height of the elemens for the axis
    props.minorLabelHeight = showMinorLabels ? props.minorCharHeight : 0;
    props.majorLabelHeight = showMajorLabels ? props.majorCharHeight : 0;
    props.height = props.minorLabelHeight + props.majorLabelHeight;
    props.width = foreground.offsetWidth;

    props.minorLineHeight =
      this.body.domProps.root.height -
      props.majorLabelHeight -
      (this.options.orientation.axis == "top"
        ? this.body.domProps.bottom.height
        : this.body.domProps.top.height);
    props.minorLineWidth = 1; // TODO: really calculate width
    props.majorLineHeight = props.minorLineHeight + props.majorLabelHeight;
    props.majorLineWidth = 1; // TODO: really calculate width

    //  take foreground and background offline while updating (is almost twice as fast)
    const foregroundNextSibling = foreground.nextSibling;
    const backgroundNextSibling = background.nextSibling;
    foreground.parentNode && foreground.parentNode.removeChild(foreground);
    background.parentNode && background.parentNode.removeChild(background);

    foreground.style.height = `${this.props.height}px`;

    // paint one viewport of overscan on each side when the axis can be
    // pan-translated, so subsequent pan frames skip the repaint entirely
    this._repaintLabels(epochUsable ? span : 0);
    this._axisEpoch = epochUsable
      ? { start: range.start, scale, paintedAt: Date.now() }
      : null;

    // put DOM online again (at the same place)
    if (foregroundNextSibling) {
      parent.insertBefore(foreground, foregroundNextSibling);
    } else {
      parent.appendChild(foreground);
    }
    if (backgroundNextSibling) {
      this.body.dom.backgroundVertical.insertBefore(
        background,
        backgroundNextSibling,
      );
    } else {
      this.body.dom.backgroundVertical.appendChild(background);
    }

    this._applyAxisPan(0);

    return this._isResized() || parentChanged;
  }

  /**
   * Apply a pan offset to the painted axis: the labels and grid lines keep
   * their epoch positions and the containers get a single translateX. The
   * sticky left major label (the date pinned to the viewport edge) is the
   * only element repositioned per frame.
   * @param {number} panOffsetPx accumulated pan distance since the epoch start
   * @private
   */
  _applyAxisPan(panOffsetPx) {
    const transform = `translateX(${-panOffsetPx}px)`;
    if (this._lastAxisTransform !== transform) {
      this._lastAxisTransform = transform;
      this.dom.foregroundContent.style.transform = transform;
      this.dom.backgroundContent.style.transform = transform;
    }
    this._updateStickyMajor(panOffsetPx);
  }

  /**
   * Keep the left-edge major label (the current date) pinned to the visible
   * left edge of the axis, showing it only while the first real major label
   * is too far right to serve that purpose (mirrors the upstream behaviour
   * that painted this label at x=0 on every repaint).
   * @param {number} panOffsetPx accumulated pan distance since the epoch start
   * @private
   */
  _updateStickyMajor(panOffsetPx) {
    let sticky = this.dom.stickyMajor;
    if (!this.options.showMajorLabels || !this.step) {
      if (sticky && sticky.style.display !== "none") {
        sticky.style.display = "none";
      }
      return;
    }
    if (!sticky) {
      const content = document.createElement("div");
      sticky = document.createElement("div");
      sticky.appendChild(content);
      sticky.className = "vis-text vis-major";
      this.dom.foreground.appendChild(sticky);
      this.dom.stickyMajor = sticky;
    }

    const leftTime = this.body.util.toTime(0);
    const text = this.step.getLabelMajor(leftTime);
    const widthText = text.length * (this.props.majorCharWidth || 10) + 10;

    // first major label at the right of the viewport's left edge
    let xFirstMajorLabel = undefined;
    const majorXs = this._majorLabelXs || [];
    for (let i = 0; i < majorXs.length; i++) {
      const xView = majorXs[i] - panOffsetPx;
      if (xView > 0) {
        xFirstMajorLabel = xView;
        break;
      }
    }

    const show = xFirstMajorLabel == undefined || widthText < xFirstMajorLabel;
    if (!show) {
      if (sticky.style.display !== "none") {
        sticky.style.display = "none";
      }
      return;
    }
    if (sticky.style.display === "none") {
      sticky.style.display = "";
    }
    if (sticky._visText !== text) {
      sticky._visText = text;
      sticky.childNodes[0].innerHTML = util.xss(text);
    }
    const y =
      this.options.orientation.axis == "top" ? 0 : this.props.minorLabelHeight;
    // Sticky labels live outside the translated content layer, so x=0 pins
    // the label to the visible left edge without a counter-translation.
    this._setXY(sticky, 0, y);
  }

  /**
   * Repaint major and minor text labels and vertical grid lines
   * @param {number} [overscan=0] extra time (in ms) to paint on both sides
   *                              of the visible range, so that pan frames
   *                              can translate the axis instead of
   *                              repainting it
   * @private
   */
  _repaintLabels(overscan = 0) {
    const orientation = this.options.orientation.axis;

    // calculate range and step (step such that we have space for 7 characters per label)
    const start = util.convert(this.body.range.start - overscan, "Number");
    const end = util.convert(this.body.range.end + overscan, "Number");
    const timeLabelsize = this.body.util
      .toTime((this.props.minorCharWidth || 10) * this.options.maxMinorChars)
      .valueOf();
    let minimumStep =
      timeLabelsize -
      DateUtil.getHiddenDurationBefore(
        this.options.moment,
        this.body.hiddenDates,
        this.body.range,
        timeLabelsize,
      );
    minimumStep -= this.body.util.toTime(0).valueOf();

    const step = new TimeStep(
      new Date(start),
      new Date(end),
      minimumStep,
      this.body.hiddenDates,
      this.options,
    );
    step.setMoment(this.options.moment);
    if (this.options.format) {
      step.setFormat(this.options.format);
    }
    if (this.options.timeAxis) {
      step.setScale(this.options.timeAxis);
    }
    this.step = step;

    // Move all DOM elements to a "redundant" list, where they
    // can be picked for re-use, and clear the lists with lines and texts.
    // At the end of the function _repaintLabels, left over elements will be cleaned up
    const dom = this.dom;
    dom.redundant.lines = dom.lines;
    dom.redundant.majorTexts = dom.majorTexts;
    dom.redundant.minorTexts = dom.minorTexts;
    dom.lines = [];
    dom.majorTexts = [];
    dom.minorTexts = [];

    let current;
    let next;
    let x;
    let xNext;
    let isMajor;
    let showMinorGrid;
    let width = 0;
    let prevWidth;
    let line;
    let count = 0;
    const MAX = 1000;
    let className;

    // epoch x positions of the painted major labels, for the sticky
    // left-edge label logic (_updateStickyMajor)
    this._majorLabelXs = [];

    step.start();
    next = step.getCurrent();
    xNext = this.body.util.toScreen(next);
    while (step.hasNext() && count < MAX) {
      count++;

      isMajor = step.isMajor();
      className = step.getClassName();

      current = next;
      x = xNext;

      step.next();
      next = step.getCurrent();
      xNext = this.body.util.toScreen(next);

      prevWidth = width;
      width = xNext - x;
      switch (step.scale) {
        case "week":
          showMinorGrid = true;
          break;
        default:
          showMinorGrid = width >= prevWidth * 0.4;
          break; // prevent displaying of the 31th of the month on a scale of 5 days
      }

      if (this.options.showMinorLabels && showMinorGrid) {
        var label = this._repaintMinorText(
          x,
          step.getLabelMinor(current),
          orientation,
          className,
        );
        label.style.width = `${width}px`; // set width to prevent overflow
      }

      if (isMajor && this.options.showMajorLabels) {
        // with overscan, offscreen majors are painted too: they become
        // visible when the axis is pan-translated
        if (overscan > 0 || x > 0) {
          this._majorLabelXs.push(x);
          label = this._repaintMajorText(
            x,
            step.getLabelMajor(current),
            orientation,
            className,
          );
        }
        line = this._repaintMajorLine(x, width, orientation, className);
      } else {
        // minor line
        if (showMinorGrid) {
          line = this._repaintMinorLine(x, width, orientation, className);
        } else {
          if (line) {
            // adjust the width of the previous grid
            line.style.width = `${parseInt(line.style.width) + width}px`;
          }
        }
      }
    }

    if (count === MAX && !warnedForOverflow) {
      console.warn(
        `Something is wrong with the Timeline scale. Limited drawing of grid lines to ${MAX} lines.`,
      );
      warnedForOverflow = true;
    }

    // NOTE: the major label pinned to the left edge is handled by
    // _updateStickyMajor (called through _applyAxisPan), which keeps it in
    // place per pan frame instead of repainting the axis.

    // Cleanup leftover DOM elements from the redundant list
    util.forEach(this.dom.redundant, (arr) => {
      while (arr.length) {
        const elem = arr.pop();
        if (elem && elem.parentNode) {
          elem.parentNode.removeChild(elem);
        }
      }
    });
  }

  /**
   * Create a minor label for the axis at position x
   * @param {number} x
   * @param {string} text
   * @param {string} orientation   "top" or "bottom" (default)
   * @param {string} className
   * @return {Element} Returns the HTML element of the created label
   * @private
   */
  _repaintMinorText(x, text, orientation, className) {
    // reuse redundant label
    let label = this.dom.redundant.minorTexts.shift();

    if (!label) {
      // create new label
      const content = document.createTextNode("");
      label = document.createElement("div");
      label.appendChild(content);
      this.dom.foregroundContent.appendChild(label);
    }
    this.dom.minorTexts.push(label);
    label.innerHTML = util.xss(text);

    let y = orientation == "top" ? this.props.majorLabelHeight : 0;
    this._setXY(label, x, y);

    label.className = `vis-text vis-minor ${className}`;
    //label.title = title;  // TODO: this is a heavy operation

    return label;
  }

  /**
   * Create a Major label for the axis at position x
   * @param {number} x
   * @param {string} text
   * @param {string} orientation   "top" or "bottom" (default)
   * @param {string} className
   * @return {Element} Returns the HTML element of the created label
   * @private
   */
  _repaintMajorText(x, text, orientation, className) {
    // reuse redundant label
    let label = this.dom.redundant.majorTexts.shift();

    if (!label) {
      // create label
      const content = document.createElement("div");
      label = document.createElement("div");
      label.appendChild(content);
      this.dom.foregroundContent.appendChild(label);
    }

    label.childNodes[0].innerHTML = util.xss(text);
    label.className = `vis-text vis-major ${className}`;
    //label.title = title; // TODO: this is a heavy operation

    let y = orientation == "top" ? 0 : this.props.minorLabelHeight;
    this._setXY(label, x, y);

    this.dom.majorTexts.push(label);
    return label;
  }

  /**
   * sets xy
   * @param {string} label
   * @param {number} x
   * @param {number} y
   * @private
   */
  _setXY(label, x, y) {
    // If rtl is true, inverse x.
    const directionX = this.options.rtl ? x * -1 : x;
    label.style.transform = `translate(${directionX}px, ${y}px)`;
  }

  /**
   * Create a minor line for the axis at position x
   * @param {number} left
   * @param {number} width
   * @param {string} orientation   "top" or "bottom" (default)
   * @param {string} className
   * @return {Element} Returns the created line
   * @private
   */
  _repaintMinorLine(left, width, orientation, className) {
    // reuse redundant line
    let line = this.dom.redundant.lines.shift();
    if (!line) {
      // create vertical line
      line = document.createElement("div");
      this.dom.backgroundContent.appendChild(line);
    }
    this.dom.lines.push(line);

    const props = this.props;

    line.style.width = `${width}px`;
    line.style.height = `${props.minorLineHeight}px`;

    let y =
      orientation == "top"
        ? props.majorLabelHeight
        : this.body.domProps.top.height;
    let x = left - props.minorLineWidth / 2;

    this._setXY(line, x, y);
    line.className = `vis-grid ${this.options.rtl ? "vis-vertical-rtl" : "vis-vertical"} vis-minor ${className}`;

    return line;
  }

  /**
   * Create a Major line for the axis at position x
   * @param {number} left
   * @param {number} width
   * @param {string} orientation   "top" or "bottom" (default)
   * @param {string} className
   * @return {Element} Returns the created line
   * @private
   */
  _repaintMajorLine(left, width, orientation, className) {
    // reuse redundant line
    let line = this.dom.redundant.lines.shift();
    if (!line) {
      // create vertical line
      line = document.createElement("div");
      this.dom.backgroundContent.appendChild(line);
    }
    this.dom.lines.push(line);

    const props = this.props;

    line.style.width = `${width}px`;
    line.style.height = `${props.majorLineHeight}px`;

    let y = orientation == "top" ? 0 : this.body.domProps.top.height;
    let x = left - props.majorLineWidth / 2;

    this._setXY(line, x, y);
    line.className = `vis-grid ${this.options.rtl ? "vis-vertical-rtl" : "vis-vertical"} vis-major ${className}`;

    return line;
  }

  /**
   * Determine the size of text on the axis (both major and minor axis).
   * The size is calculated only once and then cached in this.props.
   * @private
   */
  _calculateCharSize() {
    // Note: We calculate char size with every redraw. Size may change, for
    // example when any of the timelines parents had display:none for example.

    // determine the char width and height on the minor axis
    if (!this.dom.measureCharMinor) {
      this.dom.measureCharMinor = document.createElement("DIV");
      this.dom.measureCharMinor.className = "vis-text vis-minor vis-measure";
      this.dom.measureCharMinor.style.position = "absolute";

      this.dom.measureCharMinor.appendChild(document.createTextNode("0"));
      this.dom.foreground.appendChild(this.dom.measureCharMinor);
    }
    this.props.minorCharHeight = this.dom.measureCharMinor.clientHeight;
    this.props.minorCharWidth = this.dom.measureCharMinor.clientWidth;

    // determine the char width and height on the major axis
    if (!this.dom.measureCharMajor) {
      this.dom.measureCharMajor = document.createElement("DIV");
      this.dom.measureCharMajor.className = "vis-text vis-major vis-measure";
      this.dom.measureCharMajor.style.position = "absolute";

      this.dom.measureCharMajor.appendChild(document.createTextNode("0"));
      this.dom.foreground.appendChild(this.dom.measureCharMajor);
    }
    this.props.majorCharHeight = this.dom.measureCharMajor.clientHeight;
    this.props.majorCharWidth = this.dom.measureCharMajor.clientWidth;
  }
}

var warnedForOverflow = false;

export default TimeAxis;
