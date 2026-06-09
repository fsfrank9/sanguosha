// 审计二轮 PR-9: 极简 DOM 垫片 — 零依赖 (不引入 jsdom), 只实现
// src/ui/dom-adapter.js 实际用到的 API 表面:
//   document: getElementById (惰性注册表) / createElement / querySelector(All)
//   element:  hidden disabled value textContent innerHTML style classList
//             addEventListener click() dispatchClick() getAttribute/setAttribute
//             closest ([data-*] 形式) appendChild/removeChild options(select)
//             querySelector(All) (返回空 — phaseTrack 等静态子树不建模)
//   window:   setTimeout (入队不执行, 由测试手动 flush) alert console
//             addEventListener requestAnimationFrame (立即执行)
// 用法: 必须在动态 import dom-adapter 之前调用 installFakeDom()。

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(name) { this._set.add(name); }
  remove(name) { this._set.delete(name); }
  contains(name) { return this._set.has(name); }
  toggle(name, force) {
    var want = force === undefined ? !this._set.has(name) : !!force;
    if (want) this._set.add(name); else this._set.delete(name);
    return want;
  }
}

function selectorMatches(el, selector) {
  // 只支持 dom-adapter 实际使用的形式: [data-x] / [data-x="v"] / .class / #id
  var attrMatch = selector.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    var value = el.getAttribute(attrMatch[1]);
    if (value === null || value === undefined) return false;
    return attrMatch[2] === undefined ? true : String(value) === attrMatch[2];
  }
  if (selector.charAt(0) === '.') return el.classList.contains(selector.slice(1));
  if (selector.charAt(0) === '#') return el.id === selector.slice(1);
  return false;
}

export class FakeElement {
  constructor(id, tag) {
    this.id = id || '';
    this.tagName = (tag || 'div').toUpperCase();
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.style = {};
    this.classList = new FakeClassList();
    this.children = [];
    this.parentNode = null;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this._listeners = {};
    this._attrs = {};
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) { this._innerHTML = String(html); }

  // <select> 支持: 从 innerHTML 解析 <option value="...">
  get options() {
    var out = [];
    var re = /<option value="([^"]*)"[^>]*>/g;
    var m;
    while ((m = re.exec(this._innerHTML))) out.push({ value: m[1] });
    return out;
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  _dispatch(type, event) {
    var fns = (this._listeners[type] || []).slice();
    for (var i = 0; i < fns.length; i += 1) fns[i](event);
  }

  click() {
    if (this.disabled) return;
    this._dispatch('click', { target: this, preventDefault: function () {} });
  }

  // 事件委托容器: 模拟点击容器内一个带 data-* 属性的子按钮
  // (innerHTML 渲染的按钮不建实体节点, 用属性包合成 target)。
  dispatchClick(targetAttrs) {
    var target = new FakeElement('', 'button');
    Object.keys(targetAttrs || {}).forEach(function (k) { target.setAttribute(k, targetAttrs[k]); });
    this._dispatch('click', { target: target, preventDefault: function () {} });
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
  }

  setAttribute(name, value) { this._attrs[name] = String(value); }

  closest(selector) {
    var node = this;
    while (node) {
      if (selectorMatches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    var idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    child.parentNode = null;
    return child;
  }
}

export function installFakeDom() {
  var registry = new Map();
  var timers = [];

  var document = {
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, new FakeElement(id));
      return registry.get(id);
    },
    createElement(tag) { return new FakeElement('', tag); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  var window = {
    alerts: [],
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    alert(message) { window.alerts.push(String(message)); },
    console: console,
    addEventListener() {},
    requestAnimationFrame(fn) { fn(); return 0; }
  };

  globalThis.document = document;
  globalThis.window = window;

  return {
    document: document,
    window: window,
    $(id) { return document.getElementById(id); },
    // 执行并清空当前已排队的定时器 (enemyStep 等); 新入队的留到下次 flush。
    flushTimers() {
      var batch = timers.splice(0);
      for (var i = 0; i < batch.length; i += 1) batch[i]();
      return batch.length;
    },
    pendingTimerCount() { return timers.length; }
  };
}
