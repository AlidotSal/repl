let templatecache = {false: {}, true: {}};

let $$uniqIndex = 1;

function $$htmlToFragment(html, lastNotTag) {
    lastNotTag = !!lastNotTag;
    if(templatecache[lastNotTag][html]) return templatecache[lastNotTag][html].cloneNode(true);

    let t = document.createElement('template');
    t.innerHTML = html;
    let result = t.content;
    if(lastNotTag && result.lastChild.nodeType == 8) result.appendChild(document.createTextNode(''));
    templatecache[lastNotTag][html] = result.cloneNode(true);
    return result;
}
function $$htmlToFragmentClean(html, lastNotTag) {
    lastNotTag = !!lastNotTag;
    if(templatecache[lastNotTag][html]) return templatecache[lastNotTag][html].cloneNode(true);
    let result = $$htmlToFragment(html, lastNotTag);
    let it = document.createNodeIterator(result, 128);
    let n;
    while(n = it.nextNode()) {
        if(!n.nodeValue) n.parentNode.replaceChild(document.createTextNode(''), n);
    }    templatecache[lastNotTag][html] = result.cloneNode(true);
    return result;
}
function $$removeItem(array, item) {
    let i = array.indexOf(item);
    if(i>=0) array.splice(i, 1);
}
const $$childNodes = 'childNodes';

function $$removeElements(el, last) {
    let next;
    while(el) {
        next = el.nextSibling;
        el.remove();
        if(el == last) break;
        el = next;
    }
}
function $watch(cd, fn, callback, w) {
    if(!w) w = {};
    w.fn = fn;
    w.cb = callback;
    if(!('value' in w)) w.value = NaN;
    cd.watchers.push(w);
    return w;
}
function $watchReadOnly(cd, fn, callback) {
    return $watch(cd, fn, callback, {ro: true});
}
function $ChangeDetector(parent) {
    if(parent) this.root = parent.root;
    else {
        this.root = this;
    }
    this.watchers = [];
    this.destroyList = [];
    this.prefix = [];

    this.parent = null;
    this.first = null;
    this.last = null;
    this.prev = null;
    this.next = null;
}
Object.assign($ChangeDetector.prototype, {
    new: function() {
        var cd = new $ChangeDetector(this);
        let prev = this.last;
        if(prev) prev.next = cd;
        cd.prev = prev;
        cd.parent = this;
        this.last = cd;
        if(!this.first) this.first = cd;
        return cd;
    },
    ev: function(el, event, callback) {
        el.addEventListener(event, callback);
        this.d(() => {
            el.removeEventListener(event, callback);
        });
    },
    d: function(fn) {
        this.destroyList.push(fn);
    },
    destroy: function() {
        this.watchers.length = 0;
        this.prefix.length = 0;
        this.destroyList.forEach(fn => {
            try {
                fn();
            } catch (e) {
                console.error(e);
            }
        });
        this.destroyList.length = 0;
        if(this.prev) this.prev.next = this.next;
        if(this.next) this.next.prev = this.prev;
        if(this.parent) {
            if(this.parent.first === this) this.parent.first = this.next;
            if(this.parent.last === this) this.parent.last = this.prev;
        }
        let cd = this.first;
        while(cd) {
            cd.destroy();
            cd = cd.next;
        }
        this.first = this.last = this.prev = this.next = this.parent = null;
    }
});


const compareArray = (a, b) => {
    let a0 = Array.isArray(a);
    let a1 = Array.isArray(b);
    if(a0 !== a1) return true;
    if(!a0) return a !== b;
    if(a.length !== b.length) return true;
    for(let i=0;i<a.length;i++) {
        if(a[i] !== b[i]) return true;
    }
    return false;
};


function $$compareArray(w, value) {
    if(!compareArray(w.value, value)) return 0;
    if(Array.isArray(value)) w.value = value.slice();
    else w.value = value;
    w.cb(w.value);
    return w.ro ? 0 : 1;
}

const compareDeep = (a, b, lvl) => {
    if(lvl < 0) return false;
    if(!a || !b) return a !== b;
    let o0 = typeof(a) == 'object';
    let o1 = typeof(b) == 'object';
    if(!(o0 && o1)) return a !== b;

    let a0 = Array.isArray(a);
    let a1 = Array.isArray(b);
    if(a0 !== a1) return true;

    if(a0) {
        if(a.length !== b.length) return true;
        for(let i=0;i<a.length;i++) {
            if(compareDeep(a[i], b[i], lvl-1)) return true;
        }
    } else {
        let set = {};
        for(let k in a) {
            if(compareDeep(a[k], b[k])) return true;
            set[k] = true;
        }
        for(let k in b) {
            if(set[k]) continue;
            return true;
        }
    }

    return false;
};

function cloneDeep(d, lvl) {
    if(lvl < 0) return;
    if(!d) return d;

    if(typeof(d) == 'object') {
        if(d instanceof Date) return d;
        if(Array.isArray(d)) return d.map(i => cloneDeep(i, lvl-1));
        let r = {};
        for(let k in d) r[k] = cloneDeep(d[k], lvl-1);
        return r;
    }
    return d;
}
const $$cloneDeep = function(d) {
    return cloneDeep(d, 10);
};

function $$deepComparator(depth) {
    return function(w, value) {
        if(!compareDeep(w.value, value, depth)) return 0;
        w.value = cloneDeep(value, depth);
        w.cb(value);
        return w.ro ? 0 : 1;
    };
}
const $$compareDeep = $$deepComparator(10);

let _tick_list = [];
let _tick_planned = {};
function $tick(fn, uniq) {
    if(uniq) {
        if(_tick_planned[uniq]) return;
        _tick_planned[uniq] = true;
    }
    _tick_list.push(fn);
    if(_tick_planned.$tick) return;
    _tick_planned.$tick = true;
    setTimeout(() => {
        _tick_planned = {};
        let list = _tick_list;
        _tick_list = [];
        list.forEach(fn => {
            try {
                fn();
            } catch (e) {
                console.error(e);
            }
        });
    }, 0);
}
function $digest($cd) {
    let loop = 10;
    let w, next;
    while(loop >= 0) {
        let changes = 0;
        let i, value, cd = $cd;
        top:
        do {
            for(i=0;i<cd.prefix.length;i++) cd.prefix[i]();
            for(i=0;i<cd.watchers.length;i++) {
                w = cd.watchers[i];
                value = w.fn();
                if(w.value !== value) {
                    if(w.cmp) {
                        changes += w.cmp(w, value);
                    } else {
                        w.value = value;
                        if(!w.ro) changes++;
                        w.cb(w.value);
                    }
                }
            }            next = cd.first || cd.next;
            while(!next) {
                if(cd === $cd) break top;
                cd = cd.parent;
                next = cd.next;
            }
        } while (cd = next);
        loop--;
        if(!changes) break;
    }
    if(loop < 0) console.error('Infinity changes: ', w);
}
function $makeEmitter(option) {
    return (name, detail) => {
        let fn = option.events[name];
        if(!fn) return;
        let e = document.createEvent('CustomEvent');
        e.initCustomEvent(name, false, false, detail);
        fn(e);
    };
}
function $$addEvent(list, event, fn) {
    let prev = list[event];
    if(prev) {
        if(prev._list) prev._list.push(fn);
        else {
            function handler(e) {
                handler._list.forEach(fn => {
                    fn(e);
                });
            }
            handler._list = [prev, fn];
            list[event] = handler;
        }
    } else list[event] = fn;
}
function $$makeSpreadObject($cd, el, css) {
    let prev = {};
    let index = 0;
    let list = [];
    let defaultUsed = {};

    const props = Object.getOwnPropertyDescriptors(el.__proto__);

    const render = $$groupCall(function() {
        let obj, name, value, used = Object.assign({}, defaultUsed);
        for(let i=index-1; i>=0; i--) {
            obj = list[i];
            for(name in obj) {
                if(used[name]) continue;
                used[name] = true;
                value = obj[name];
                if(prev[name] == value) continue;
                prev[name] = value;

                if(props[name] && props[name].set) {
                    el[name] = value;
                } else {
                    if(value == null) el.removeAttribute(name);
                    else {
                        if(name == 'class' && css) value += ' ' + css;
                        el.setAttribute(name, value);
                    }
                }
            }
        }
    });

    return {
        spread: function(fn) {
            let i = index++;
            $watch($cd, fn, value => {
                list[i] = value;
                render();
            }, {ro: true, cmp: $$deepComparator(1)});
        },
        prop: function(name, fn) {
            let i = index++;
            list[i] = {};
            $watch($cd, fn, value => {
                list[i][name] = value;
                render();
            }, {ro: true});
        },
        attr: function(name, value) {
            let d = {};
            d[name] = value;
            list[index++] = d;
        },
        except: function(list) {
            list.forEach(n => defaultUsed[n] = true);
        }
    }
}
function $$makeSpreadObject2($cd, props) {
    let index = 0;
    let list = [];
    let self = {};
    let defaultUsed = {};

    const emit = $$groupCall(() => {
        self.build();
        self.emit && self.emit();
    });

    self.build = () => {
        let obj, name, used = Object.assign({}, defaultUsed);
        for(let i=index-1; i>=0; i--) {
            obj = list[i];
            for(name in obj) {
                if(used[name]) continue;
                used[name] = true;
                props[name] = obj[name];
            }
        }
    };

    self.spread = function(fn) {
        let i = index++;
        let value = fn();
        list[i] = value;
        $watch($cd, fn, value => {
            list[i] = value;
            emit();
        }, {ro: true, cmp: $$compareDeep, value: $$cloneDeep(value)});
    };
    self.prop = function(name, fn) {
        let value = fn();
        let i = index++;
        list[i] = {};
        list[i][name] = value;
        $watch($cd, fn, value => {
            list[i][name] = value;
            emit();
        }, {ro: true, cmp: $$compareDeep, value: $$cloneDeep(value)});
    };
    self.attr = function(name, value) {
        let d = {};
        d[name] = value;
        list[index++] = d;
    };
    self.except = function(list) {
        list.forEach(n => defaultUsed[n] = true);
    };
    return self;
}
function $$makeProp($component, $props, bound, name, getter, setter) {
    let value = $props[name];
    if(value !== void 0) setter(value);
    if((bound[name] || bound.$$spreading) && (bound[name] !== 2)) $component.push.push(() => setter($props[name]));
    $component.exportedProps[name] = true;

    Object.defineProperty($component, name, {
        get: getter,
        set: setter
    });
}

function $$groupCall(emit) {
    let id = `gc${$$uniqIndex++}`;
    const fn = function() {
        $tick(() => {
            fn.emit && fn.emit();
        }, id);
    };
    fn.emit = emit;
    return fn;
}
function $$makeApply($cd) {
    let stop, id = `a${$$uniqIndex++}`;
    return function apply(option) {
        if(option === false) {
            if(_tick_planned.apply) stop = true;
            return;
        }
        if(apply._p) return;

        $tick(() => {
            if(stop) return stop = false;
            try {
                apply._p = true;
                $digest($cd);
            } finally {
                apply._p = false;
            }
        }, id);
    };
}

function $$makeComponent($element, $option) {
    let $component = {
        $cd: new $ChangeDetector(),
        exportedProps: {},
        push: []
    };

    $component.destroy = () => $component.$cd.destroy();
    $component.$$render = (rootTemplate) => {
        if ($option.afterElement) {
            $element.parentNode.insertBefore(rootTemplate, $element.nextSibling);
        } else {
            $element.innerHTML = '';
            $element.appendChild(rootTemplate);
        }
    };

    return $component;
}
function $$componentCompleteProps($component, $$apply, $props) {
    let list = $component.push;
    let recalcAttributes, $attributes = $props;
    $component.push = () => {
        list.forEach(fn => fn());
        recalcAttributes();
        $$apply();
    };

    $attributes = {};
    for(let k in $props) {
        if(!$component.exportedProps[k]) {
            $attributes[k] = $props[k];
            recalcAttributes = 1;
        }
    }
    if(recalcAttributes) {
        recalcAttributes = () => {
            for(let k in $attributes) $attributes[k] = $props[k];
        };
    } else recalcAttributes = () => {};

    return $attributes;
}

function $$htmlBlock($cd, tag, fn) {
    let lastElement;
    let create = (html) => {
        let fr = $$htmlToFragment(html);
        lastElement = fr.lastChild;
        tag.parentNode.insertBefore(fr, tag.nextSibling);
    };
    let destroy = () => {
        if(!lastElement) return;
        let next, el = tag.nextSibling;
        while(el) {
            next = el.nextSibling;
            el.remove();
            if(el == lastElement) break;
            el = next;
        }

        lastElement = null;
    };
    $watch($cd, fn, (html) => {
        destroy();
        if(html) create(html);
    }, {ro: true});
}

function $$ifBlock($cd, $parentElement, fn, tpl, build, tplElse, buildElse) {
    let childCD;
    let first, last;

    function create(fr, builder) {
        childCD = $cd.new();
        let tpl = fr.cloneNode(true);
        builder(childCD, tpl);
        first = tpl.firstChild;
        last = tpl.lastChild;
        $parentElement.parentNode.insertBefore(tpl, $parentElement.nextSibling);
    }
    function destroy() {
        if(!childCD) return;
        childCD.destroy();
        childCD = null;
        $$removeElements(first, last);
        first = last = null;
    }
    $watch($cd, fn, (value) => {
        if(value) {
            destroy();
            create(tpl, build);
        } else {
            destroy();
            if(buildElse) create(tplElse, buildElse);
        }
    });
}

function $$awaitBlock($cd, label, fn, $$apply, build_main, build_then, build_catch, tpl_main, tpl_then, tpl_catch) {
    let promise, childCD;
    let first, last, status = 0;

    function remove() {
        if(!childCD) return;
        childCD.destroy();
        childCD = null;
        $$removeElements(first, last);
        first = last = null;
    }
    function render(build, tpl, value) {
        if(childCD) remove();
        if(!tpl) return;
        childCD = $cd.new();
        let fr = tpl.cloneNode(true);
        build(childCD, fr, value);
        $$apply();
        first = fr.firstChild;
        last = fr.lastChild;
        label.parentNode.insertBefore(fr, label.nextSibling);
    }
    $watchReadOnly($cd, fn, p => {
        if(status !== 1) render(build_main, tpl_main);
        status = 1;
        if(p && p instanceof Promise) {
            promise = p;
            promise.then(value => {
                status = 2;
                if(promise !== p) return;
                render(build_then, tpl_then, value);
            }).catch(value => {
                status = 3;
                if(promise !== p) return;
                render(build_catch, tpl_catch, value);
            });
        }
    });
}

export { $$addEvent, $$awaitBlock, $$childNodes, $$cloneDeep, $$compareArray, $$compareDeep, $$componentCompleteProps, $$deepComparator, $$groupCall, $$htmlBlock, $$htmlToFragment, $$htmlToFragmentClean, $$ifBlock, $$makeApply, $$makeComponent, $$makeProp, $$makeSpreadObject, $$makeSpreadObject2, $$removeElements, $$removeItem, $ChangeDetector, $digest, $makeEmitter, $tick, $watch, $watchReadOnly };
