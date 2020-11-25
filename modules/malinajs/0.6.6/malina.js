(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('acorn'), require('astring'), require('css-tree')) :
    typeof define === 'function' && define.amd ? define(['exports', 'acorn', 'astring', 'css-tree'], factory) :
    (global = global || self, factory(global.malina = {}, global.acorn, global.astring, global['css-tree']));
}(this, (function (exports, acorn, astring, csstree) { 'use strict';

    acorn = acorn && Object.prototype.hasOwnProperty.call(acorn, 'default') ? acorn['default'] : acorn;
    astring = astring && Object.prototype.hasOwnProperty.call(astring, 'default') ? astring['default'] : astring;
    csstree = csstree && Object.prototype.hasOwnProperty.call(csstree, 'default') ? csstree['default'] : csstree;

    let _svgElements = 'animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,tspan,unknown,use,view';
    let svgElements = {};
    _svgElements.split(',').forEach(k => svgElements[k] = true);

    function assert(x, info) {
        if(!x) throw info || (new Error('AssertError'));
    }

    function replace(s, from, to, count) {
        let d = s.split(from);
        if(count) assert(d.length === count + 1, 'Replace multi-entry');
        return d.join(to);
    }

    function Q(s) {
        return s.replace(/`/g, '\\`');
    }
    function Q2(s) {
        return s.replace(/`/g, '\\`').replace(/\n/g, '\\n');
    }
    function unwrapExp(e) {
        assert(e, 'Empty expression');
        let rx = e.match(/^\{(.*)\}$/);
        assert(rx, 'Wrong expression: ' + e);
        return rx[1];
    }
    function isSimpleName(name) {
        if(!name) return false;
        if(!name.match(/^([\w\$_][\w\d\$_\.]*)$/)) return false;
        if(name[name.length - 1] == '.') return false;
        return true;
    }

    function detectExpressionType(name) {
        if(isSimpleName(name)) return 'identifier';

        let ast = acorn.parse(name, {allowReturnOutsideFunction: true});

        function checkIdentificator(body) {
            if(body.length != 1) return;
            if(body[0].type != 'ExpressionStatement') return;
            if(body[0].expression.type != 'Identifier') return;
            return true;
        }

        function checkMemberIdentificator(body) {
            if(body.length != 1) return;
            if(body[0].type != 'ExpressionStatement') return;
            let obj = body[0].expression;
            if(obj.type != 'MemberExpression') return;
            if(obj.property.type != 'Identifier') return;
            return true;
        }

        function checkFunction(body) {
            if(body.length != 1) return;
            if(body[0].type != 'ExpressionStatement') return;
            let obj = body[0].expression;
            if(obj.type != 'ArrowFunctionExpression') return;
            return true;
        }

        if(checkIdentificator(ast.body)) return 'identifier';
        if(checkMemberIdentificator(ast.body)) return 'identifier';
        if(checkFunction(ast.body)) return 'function';

        return;
    }

    function checkRootName(name) {
        let rx = name.match(/^([\w\$_][\w\d\$_]*)/);
        if(!rx) return this.config.warning({message: 'Error name: ' + name});
        let root = rx[1];

        if(this.script.rootVariables[root] || this.script.rootFunctions[root]) return true;
        this.config.warning({message:'No name: ' + name});
    }
    function compactDOM() {
        let data = this.DOM;
        const details = {
            node: [n => n.body],
            each: [n => n.body],
            slot: [n => n.body],
            fragment: [n => n.body],
            if: [n => n.body, n => n.bodyMain],
            await: [n => n.parts.main, n => n.parts.then, n => n.parts.catch]
        };

        function go(body, parentNode) {
            let i;

            const getPrev = () => {
                return i > 0 && body.length ? body[i - 1] : null;
            };

            const getNext = () => {
                return i < body.length ? body[i + 1] : null;
            };

            for(i=0; i<body.length; i++) {
                let node = body[i];
                if(node.type == 'text') {
                    let next = getNext();
                    if(next && next.type == 'text') {
                        node.value += next.value;
                        body.splice(i + 1, 1);
                    }

                    if(node.value) {
                        if(!node.value.trim()) {
                            node.value = ' ';
                        } else {
                            let rx = node.value.match(/^(\s*)(.*?)(\s*)$/);
                            if(rx) {
                                let r = '';
                                if(rx[1]) r += ' ';
                                r += rx[2];
                                if(rx[3]) r += ' ';
                                node.value = r;
                            }
                        }
                    }
                } else {
                    if(node.type == 'node' && (node.name == 'pre' || node.name == 'textarea')) continue;
                    let keys = details[node.type];
                    keys && keys.forEach(k => {
                        let body = k(node);
                        if(body && body.length) go(body, node);
                    });
                }
            }

            i = 0;
            while(i < body.length) {
                let node = body[i];
                if(node.type == 'text' && !node.value.trim()) {
                    let prev = getPrev();
                    let next = getNext();
                    if(prev && next) {
                        if(prev.type == 'node' && next.type == 'node') {
                            if(prev.name == 'td' && next.name == 'td' ||
                                prev.name == 'tr' && next.name == 'tr' ||
                                prev.name == 'li' && next.name == 'li' ||
                                prev.name == 'div' && next.name == 'div') {
                                    body.splice(i, 1);
                                    continue;
                                }
                        }
                    } else if(parentNode) {
                        let p = prev && prev.type == 'node' && prev.name;
                        let n = next && next.type == 'node' && next.name;

                        if((p == 'td' || n == 'td') && ((parentNode.type == 'node' && parentNode.name == 'tr') || (parentNode.type == 'each'))) {
                            body.splice(i, 1);
                            continue;
                        }
                        if((p == 'tbody' || n == 'tbody') && (parentNode.type == 'node' && parentNode.name == 'table')) {
                            body.splice(i, 1);
                            continue;
                        }
                        if((p == 'li' || n == 'li') && (parentNode.type == 'node' && parentNode.name == 'ul')) {
                            body.splice(i, 1);
                            continue;
                        }
                        if(parentNode.type == 'node' && parentNode.name == 'div') {
                            body.splice(i, 1);
                            continue;
                        }
                        if(parentNode.type == 'node' && (prev && prev.type == 'each' || next && next.type == 'each')) {
                            body.splice(i, 1);
                            continue;
                        }
                    }
                }
                i++;
            }

        }

        go(data.body);
    }
    const genId = () => {
        let id = Math.floor(Date.now() * Math.random()).toString(36);
        if(id.length > 6) id = id.substring(id.length - 6);
        return 'm' + id;
    };

    function parse() {
        let source = this.source;
        let index = 0;

        const readNext = () => {
            assert(index < source.length, 'EOF');
            return source[index++];
        };

        const readTag = () => {
            let start = index;
            let a = readNext();
            assert(a === '<', 'Tag error');
            let attributes = [];
            let begin = true;
            let name = '';
            let bind = 0;
            let eq, attr_start;
            let elArg = null;

            const error = (name) => {
                let e = new Error(name);
                e.details = source.substring(start, index);
                throw e;
            };

            function flush(shift) {
                if(!attr_start) return;
                shift = shift || 0;
                let end = index - 1 + shift;
                if(elArg === true) {
                    elArg = source.substring(attr_start, end);
                    attr_start = null;
                    eq = null;
                    return;
                }
                let a = {
                    content: source.substring(attr_start, end)
                };
                if(eq) {
                    a.name = source.substring(attr_start, eq);
                    a.value = source.substring(eq + 1, end);
                    if(a.value[0] == '"' || a.value[0] == '\'') a.value = a.value.substring(1);
                    let i = a.value.length - 1;
                    if(a.value[i] == '"' || a.value[i] == '\'') a.value = a.value.substring(0, i);
                } else a.name = a.content;
                attributes.push(a);
                attr_start = null;
                eq = null;
            }
            while(true) {
                a = readNext();
                if(!begin && !attr_start && a.match(/\S/) && a != '/' && a != '>') attr_start = index - 1;
                if(a == '"' || a == "'" || a == '`') {
                    while(a != readNext());
                    continue;
                }
                if(a == '{') {
                    bind++;
                    continue;
                }
                if(bind) {
                    if(a == '}') {
                        bind--;
                        if(bind > 0) continue;
                        flush(1);
                    }
                    continue;
                }
                if(a == '}') error('Wrong attr');
                if(a == '<') error('Wrong tag');
                if(a == '/') {
                    a = readNext();
                    assert(a == '>');
                    flush(-1);
                }
                if(a == '>') {
                    flush();
                    const voidTags = ['fragment', 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
                    let voidTag = voidTags.indexOf(name) >= 0;
                    let closedTag = voidTag || source[index-2] == '/';
                    return {
                        type: 'node',
                        name,
                        elArg,
                        openTag: source.substring(start, index),
                        start: start,
                        end: index,
                        closedTag,
                        voidTag,
                        attributes
                    }
                }
                if(begin) {
                    if(a.match(/[\da-zA-Z]/)) {
                        name += a;
                        continue;
                    } else {
                        begin = false;
                        if(a == ':') {
                            elArg = true;
                            attr_start = index;
                        }
                    }
                } else if(attr_start) {
                    if(a == '=' && !eq) eq = index - 1;
                    else if(a.match(/\s/)) flush();
                }
            }
        };

        const readScript = (tag) => {
            let endTag = `</${tag}>`;
            let q, a, p, start = index;
            while(true) {
                p = a;
                a = readNext();
                if(q) {
                    if(a != q) continue;
                    if(p == '\\') continue;
                    q = null;
                    continue
                }
                if(a == '"' || a == '\'' || a == '`') {
                    q = a;
                    continue;
                }
                if(a == '<') {
                    if(source.substring(index-1, index + endTag.length - 1) == endTag) {
                        let end = index - 1;
                        index += endTag.length - 1;
                        return source.substring(start, end);
                    }
                }
            }
        };

        const readStyle = () => {
            let start = index;
            let end = source.substring(start).indexOf('</style>') + start;
            assert(end >= 0, '<style> is not closed');
            index = end + 9;
            return source.substring(start, end);
        };

        const readBinding = () => {
            let start = index;
            assert(readNext() === '{', 'Bind error');
            let q;
            let bkt = 1;

            while(true) {
                let a = readNext();

                if(q) {
                    if(a != q) continue;
                    q = null;
                    continue
                }
                if(a == '"' || a == '\'' || a == '`') {
                    q = a;
                    continue;
                }

                if(a == '{') {
                    bkt++;
                    continue;
                }
                if(a == '}') {
                    bkt--;
                    if(bkt > 0) continue;
                } else continue;

                return {
                    value: source.substring(start + 1, index - 1)
                };
            }
        };

        const readComment = () => {
            let start = index;
            let end = source.indexOf('-->', start);
            assert(end >= 0, 'Comment is not closed');
            end += 3;
            index = end;
            return source.substring(start, end);
        };

        const go = (parent) => {
            let textNode = null;

            const flushText = () => {
                if(!textNode) return;
                parent.body.push(textNode);
                textNode = null;
            };

            while(index < source.length) {
                let a = source[index];
                if(a === '<') {
                    flushText();

                    if(source.substring(index, index + 4) === '<!--') {
                        parent.body.push({
                            type: 'comment',
                            content: readComment()
                        });
                        continue;
                    }

                    if(source[index + 1] === '/') {  // close tag
                        let name = '';
                        index += 2;
                        while(true) {
                            a = readNext();
                            if(a === '>') break;
                            name += a;
                        }
                        assert(name === parent.name, 'Wrong close-tag: ' + parent.name + ' - ' + name);
                        return;
                    }

                    let tag = readTag();
                    parent.body.push(tag);
                    if(tag.name === 'script') {
                        tag.type = 'script';
                        tag.content = readScript('script');
                        continue;
                    } else if(tag.name === 'template') {
                        tag.type = 'template';
                        tag.content = readScript('template');
                        continue;
                    } else if(tag.name === 'style') {
                        tag.type = 'style';
                        tag.content = readStyle();
                        continue;
                    } else {
                        tag.classes = new Set();
                    }
                    if(tag.closedTag) continue;

                    tag.body = [];
                    try {
                        go(tag);
                    } catch (e) {
                        if(typeof e == 'string') e = new Error(e);
                        if(!e.details) e.details = tag.openTag;
                        throw e;
                    }
                    continue;
                } else if(a === '{') {
                    if(['#', '/', ':', '@'].indexOf(source[index + 1]) >= 0) {
                        flushText();
                        let bind = readBinding();
                        if(bind.value.match(/^@\w+/)) {
                            let tag = {
                                type: 'systag',
                                value: bind.value
                            };
                            parent.body.push(tag);
                            continue;
                        } else if(bind.value.startsWith('#each ')) {
                            let tag = {
                                type: 'each',
                                value: bind.value,
                                body: []
                            };
                            parent.body.push(tag);
                            go(tag);
                            continue;
                        } else if(bind.value === '/each') {
                            assert(parent.type === 'each', 'Bind error: /each');
                            return;
                        } else if(bind.value.startsWith('#if ')) {
                            let tag = {
                                type: 'if',
                                value: bind.value,
                                body: []
                            };
                            parent.body.push(tag);
                            go(tag);
                            continue;
                        } else if(bind.value === '/if') {
                            assert(parent.type === 'if', 'Bind error: /if');
                            return;
                        } else if(bind.value === ':else') {
                            assert(parent.type === 'if', 'Bind error: :else');
                            parent.bodyMain = parent.body;
                            parent.body = [];
                        } else if(bind.value.startsWith('#await ')) {
                            let mainPart = [];
                            let tag = {
                                type: 'await',
                                value: bind.value,
                                body: mainPart,
                                parts: {
                                    main: mainPart,
                                    mainValue: bind.value
                                }
                            };
                            parent.body.push(tag);
                            go(tag);
                            continue;
                        } else if(bind.value.match(/^\:then( |$)/)) {
                            assert(parent.type === 'await', 'Bind error: await-then');
                            let thenPart = [];
                            parent.parts.then = thenPart;
                            parent.parts.thenValue = bind.value;
                            parent.body = thenPart;
                        } else if(bind.value.match(/^\:catch( |$)/)) {
                            assert(parent.type === 'await', 'Bind error: await-catch');
                            let catchPart = [];
                            parent.parts.catch = catchPart;
                            parent.parts.catchValue = bind.value;
                            parent.body = catchPart;
                        } else if(bind.value == '/await') {
                            assert(parent.type === 'await', 'Bind error: /await');
                            return;
                        } else if(bind.value.match(/^\#slot(\:| |$)/)) {
                            let tag = {
                                type: 'slot',
                                value: bind.value,
                                body: []
                            };
                            parent.body.push(tag);
                            go(tag);
                            continue;
                        } else if(bind.value == '/slot') {
                            assert(parent.type === 'slot', 'Slot error: /slot');
                            return;
                        } else if(bind.value.match(/^\#fragment\W/)) {
                            let tag = {
                                type: 'fragment',
                                value: bind.value,
                                body: []
                            };
                            parent.body.push(tag);
                            go(tag);
                            continue;
                        } else if(bind.value == '/fragment') {
                            assert(parent.type === 'fragment', 'Fragment error: /fragment');
                            return;
                        } else throw 'Error binding: ' + bind.value;
                    }
                }

                if(!textNode) {
                    textNode = {
                        type: 'text',
                        value: ''
                    };
                }
                textNode.value += readNext();
            }        flushText();
            assert(parent.type === 'root', 'File ends to early');
        };

        let root = {
            type: 'root',
            body: []
        };
        go(root);

        this.DOM = root;
    }

    function parseText(source) {
        let i = 0;
        let step = 0;
        let text = '';
        let exp = '';
        let q;
        let len = source.length;
        let parts = [];
        while(i < len) {
            let a = source[i++];
            if(step == 1) {
                if(q) {
                    if(a === q) q = null;
                    exp += a;
                    continue;
                }
                if(a === '"' || a === "'" || a === '`') {
                    q = a;
                    exp += a;
                    continue;
                }
                if(a === '}') {
                    step = 0;
                    exp = exp.trim();
                    if(!exp) throw 'Wrong expression';
                    parts.push({value: exp, type: 'exp'});
                    exp = '';
                    continue;
                }
                exp += a;
                continue;
            }
            if(a === '{') {
                if(text) {
                    parts.push({value: text, type: 'text'});
                    text = '';
                }
                step = 1;
                continue;
            }
            text += a;
        }
        if(text) parts.push({value: text, type: 'text'});
        assert(step == 0, 'Wrong expression: ' + source);
        let result;
        if(parts.length == 1 && parts[0].type == 'exp' && parts[0].value == '$class') {
            result = "''+$class";
        } else {
            result = parts.map(p => p.type == 'text' ? '`' + this.Q(p.value) + '`' : '(' + p.value + ')').join('+');
        }
        return {result, parts};
    }

    function parse$1() {
        let source = this.scriptNodes.length ? this.scriptNodes[0].content : null;
        this.script = {
            source,
            watchers: [],
            imports: [],
            importedNames: [],
            props: [],
            rootVariables: {},
            rootFunctions: {}
        };
        if(source) {
            source = source.split(/\n/).map(line => {
                let rx = line.match(/^(\s*)\/\/(.*)$/);
                if(!rx) return line;
                let code = rx[2].trim();
                if(code != '!no-check') return line;
                return rx[1] + '$$_noCheck;';
            }).join('\n');
            this.script.ast = acorn.parse(source, {sourceType: 'module', ecmaVersion: 12});
        } else {
            this.script.ast = {
                body: [],
                sourceType: "module",
                type: "Program"
            };
        }
    }
    function transform() {
        const result = this.script;
        const source = this.script.source;
        const ast = this.script.ast;

        let rootVariables = result.rootVariables;
        let rootFunctions = result.rootFunctions;
        ast.body.forEach(n => {
            if(n.type == 'FunctionDeclaration') {
                rootFunctions[n.id.name] = true;
            } else if(n.type == 'VariableDeclaration') {
                n.declarations.forEach(i => {
                    rootVariables[i.id.name] = true;
                    if(i.init && i.init.type == 'ArrowFunctionExpression') rootFunctions[i.id.name] = true;
                });
            }
        });

        result.onMount = rootFunctions.onMount;
        result.onDestroy = rootFunctions.onDestroy;
        let insertOnDestroy = !(rootFunctions.$onDestroy || rootVariables.$onDestroy);

        const funcTypes = {
            FunctionDeclaration: 1,
            FunctionExpression: 1,
            ArrowFunctionExpression: 1
        };

        function applyBlock() {
            return {
                _apply: true,
                type: 'ExpressionStatement',
                expression: {
                    callee: {
                        type: 'Identifier',
                        name: '$$apply'
                    },
                    type: 'CallExpression'
                }
            }
        }

        function returnApplyBlock(a) {
            return {
                _apply: true,
                callee: {
                    type: 'Identifier',
                    name: '$$apply'
                },
                type: 'CallExpression',
                arguments: [a]
            }
        }

        function isInLoop(node) {
            if(!node._parent || node._parent.type != 'CallExpression') return false;
            if(node._parent.callee.type != 'MemberExpression') return false;
            let method = node._parent.callee.property.name;
            return method == 'forEach' || method == 'map' || method == 'filter';
        }

        function isNoCheck(node) {
            return node.type == 'ExpressionStatement' && node.expression.type == 'Identifier' && node.expression.name == '$$_noCheck';
        }
        function transformNode(node) {
            if(funcTypes[node.type] && node.body.body && node.body.body.length) {
                if(insertOnDestroy && node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
                for(let i=0; i<node.body.body.length; i++) {
                    let n = node.body.body[i];
                    if(!isNoCheck(n)) continue;
                    node.body.body.splice(i, 1);
                    return 'stop';
                }
                if(!isInLoop(node)) {
                    node.body.body.unshift(applyBlock());
                }
            } else if(node.type == 'ArrowFunctionExpression') {
                if(insertOnDestroy && node._parent.type == 'CallExpression' && node._parent.callee.name == '$onDestroy') return 'stop';
                if(node.body.type != 'BlockStatement' && !isInLoop(node)) {
                    node.body = {
                        type: 'BlockStatement',
                        body: [{
                            type: 'ReturnStatement',
                            argument: node.body
                        }]
                    };
                    transformNode(node);
                }
            } else if(node.type == 'AwaitExpression') {
                let n = node, p;
                while(n._parent) {
                    p = n._parent;
                    if(p.type == 'BlockStatement') break;
                    n = p;
                    p = null;
                }
                if(p) {
                    let i = p.body.indexOf(n);
                    if(i >= 0 && !(p.body[i + 1] && p.body[i + 1]._apply)) {
                        if(n.type == 'ReturnStatement') {
                            n.argument = returnApplyBlock(n.argument);
                        } else {
                            p.body.splice(i + 1, 0, applyBlock());
                        }
                    }
                }
            }
        }
        function walk(node, parent, fn) {
            if(typeof node !== 'object') return;

            if(node._apply) return;
            node._parent = parent;
            let forParent = parent;
            if(node.type) {
                if(fn(node) == 'stop') return;
                forParent = node;
            }
            for(let key in node) {
                let child = node[key];
                if(key == '_parent') continue;
                if(!child || typeof child !== 'object') continue;

                if(Array.isArray(child)) {
                    for(let i=0;i<child.length;i++) {
                        walk(child[i], forParent, fn);
                    }
                } else {
                    walk(child, forParent, fn);
                }
            }
        }    walk(ast, null, transformNode);

        function makeVariable(name) {
            return {
                "type": "VariableDeclaration",
                "declarations": [{
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": name
                    },
                    "init": null
                }],
                "kind": "var"
            }
        }

        function makeWatch(n) {
            function assertExpression(n) {
                if(n.type == 'Identifier') return;
                if(n.type.endsWith('Expression')) return;
                throw 'Wrong expression';
            }
            if(n.body.type != 'ExpressionStatement') throw 'Error';
            if(n.body.expression.type == 'AssignmentExpression') {
                const ex = n.body.expression;
                if(ex.operator != '=') throw 'Error';
                let target;
                if(ex.left.type == 'Identifier') {
                    target = ex.left.name;
                    if(!(target in rootVariables)) resultBody.push(makeVariable(target));
                } else if(ex.left.type == 'MemberExpression') {
                    target = source.substring(ex.left.start, ex.left.end);
                } else throw 'Error';
                assertExpression(ex.right);
                const exp = source.substring(ex.right.start, ex.right.end);
                result.watchers.push(`$cd.prefix.push(() => {${target} = ${exp};});`);
            } else if(n.body.expression.type == 'SequenceExpression') {
                const ex = n.body.expression.expressions;
                const handler = ex[ex.length - 1];
                let callback = source.substring(handler.start, handler.end);
                if(handler.type == 'ArrowFunctionExpression' || handler.type == 'FunctionExpression') ; else if(detectExpressionType(callback) == 'identifier') {
                    callback = `(v) => { ${callback}(v); }`;
                } else {
                    callback = `() => { ${callback}; }`;
                }

                if(ex.length == 2) {
                    assertExpression(ex[0]);
                    let exp = source.substring(ex[0].start, ex[0].end);
                    result.watchers.push(`$watch($cd, () => (${exp}), ${callback}, {cmp: $runtime.$$deepComparator(0)});`);
                } else if(ex.length > 2) {
                    for(let i = 0;i<ex.length-1;i++) assertExpression(ex[i]);
                    let exp = source.substring(ex[0].start, ex[ex.length-2].end);
                    result.watchers.push(`$watch($cd, () => [${exp}], ($args) => { (${callback}).apply(null, $args); }, {cmp: $runtime.$$deepComparator(1)});`);
                } else throw 'Error';
            } else throw 'Error';
        }

        let imports = [];
        let resultBody = [];
        let lastPropIndex = null;

        ast.body.forEach(n => {
            if(n.type == 'ImportDeclaration') {
                imports.push(n);
                n.specifiers.forEach(s => {
                    if(s.local.type != 'Identifier') return;
                    result.importedNames.push(s.local.name);
                    if(s.type != 'ImportDefaultSpecifier') return;
                    result.imports.push(s.local.name);
                });
                return;
            } else if(n.type == 'ExportNamedDeclaration') {
                assert(n.declaration.type == 'VariableDeclaration', 'Wrong export');
                n.declaration.declarations.forEach(d => {
                    assert(d.type == 'VariableDeclarator', 'Wrong export');
                    result.props.push(d.id.name);
                    resultBody.push({
                        type: 'VariableDeclaration',
                        kind: 'let',
                        declarations: [{
                            type: 'VariableDeclarator',
                            id: {
                                type: 'ObjectPattern',
                                properties: [{
                                    type: 'Property',
                                    method: false,
                                    shorthand: true,
                                    computed: false,
                                    kind: 'init',
                                    key: d.id,
                                    value: d.init ? {
                                        type: 'AssignmentPattern',
                                        left: d.id,
                                        right: d.init
                                    } : d.id
                                }]
                            },
                            init: {type: 'Identifier', name: '$props'}
                        }]
                    });
                    lastPropIndex = resultBody.length;
                });
                return;
            }

            if(n.type == 'LabeledStatement' && n.label.name == '$') {
                try {
                    makeWatch(n);
                    return;
                } catch (e) {
                    throw new Error(e + ': ' + source.substring(n.start, n.end));
                }
            }
            resultBody.push(n);
        });

        let header = [];
        header.push(rawNode('const $component = $runtime.$$makeComponent($element, $option);'));
        header.push(rawNode('const $$apply = $component.apply;'));
        header.push(rawNode('$$runtimeHeader();'));

        if(lastPropIndex != null) {
            header.push(rawNode('const $props = $option.props;'));
            resultBody.splice(lastPropIndex, 0,
                rawNode(`let $$skipAttrs = {${result.props.map(n => n + ':1').join(',')}};`, {_name: '$attributes'}),
                rawNode('let $attributes = $runtime.recalcAttributes($props, $$skipAttrs);', {_name: '$attributes'}),
                rawNode(`$runtime.completeProps($component, () => {
                ({${result.props.join(',')}} = $props);`),
                rawNode('$attributes = $runtime.recalcAttributes($props, $$skipAttrs);', {_name: '$attributes'}),
                rawNode(`}, {${result.props.map(n => n + ': () => '+n).join(',')}});`)
            );
        } else {
            header.push(rawNode('const $props = $option.props;', {_name: '$props'}));
            header.push(rawNode('let $attributes = $props;', {_name: '$attributes'}));
        }
        header.push(rawNode('const $context = $component.context;', {_name: '$context'}));

        if(this.config.autoSubscribe) {
            result.importedNames.forEach(name => {
                header.push(rawNode(`$runtime.autoSubscribe($component, ${name});`));
            });
        }

        if(!rootFunctions.$emit) header.push(rawNode('const $emit = $runtime.$makeEmitter($option);', {_name: '$emit'}));
        if(insertOnDestroy) header.push(rawNode('function $onDestroy(fn) {$runtime.cd_onDestroy($component.$cd, fn);};'));
        while(header.length) {
            resultBody.unshift(header.pop());
        }

        if(this.scriptNodes[0] && this.scriptNodes[0].attributes.some(a => a.name == 'property')) {
            result.props.forEach(name => {
                resultBody.push(rawNode(`$runtime.makeExternalProperty($component, '${name}', () => ${name}, _${name} => ${name} = _${name});`));
            });
        }

        resultBody.push(rawNode('$$runtime();'));
        this.script.rootLevel = resultBody;

        let widgetFunc = {
            body: {
                type: 'BlockStatement',
                body: resultBody
            },
            id: {
                type: 'Identifier"',
                name: this.config.name
            },
            params: [{
                type: 'Identifier',
                name: '$element'
            }, {
                type: 'AssignmentPattern',
                left: {
                    type: 'Identifier',
                    name: '$option'
                },
                right: {
                    type: 'ObjectExpression',
                    properties: []
                }
            }],
            type: 'FunctionDeclaration'
        };

        if(this.config.exportDefault) {
            widgetFunc = {
                type: 'ExportDefaultDeclaration',
                declaration: widgetFunc
            };
        }
        ast.body = [widgetFunc];
        ast.body.unshift.apply(ast.body, imports);
    }
    function build() {
        const generator = Object.assign({
            ImportExpression: function(node, state) {
                state.write('import(');
                this[node.source.type](node.source, state);
                state.write(')');
            },
            Raw: function(node, state) {
                state.write(node.value);
            }
        }, astring.baseGenerator);
        this.script.code = astring.generate(this.script.ast, {generator});
    }


    function rawNode(exp, n) {
        n = n || {};
        n.type = 'Raw';
        n.value = exp;
        return n;
    }

    function buildRuntime() {
        let runtime = [`
        return (function() {
            let $cd = $component.$cd;
    `];

        let bb = this.buildBlock(this.DOM);

        let rootTemplate = bb.tpl;
        runtime.push(bb.source);

        if(bb.svg) {
            runtime.push(`const rootTemplate = $runtime.svgToFragment(\`${this.Q(rootTemplate)}\`);`);
        } else {
            runtime.push(`const rootTemplate = $$htmlToFragment(\`${this.Q(rootTemplate)}\`);`);
        }
        runtime.push(`
        ${bb.name}($cd, rootTemplate);
        $component.$$render(rootTemplate);
    `);
        if(this.script.onMount) runtime.push(`
        if($option.noMount) $component.onMount = onMount;
        else $tick(onMount);
    `);
        if(this.script.onDestroy) runtime.push(`$runtime.cd_onDestroy($cd, onDestroy);`);
        if(this.script.watchers.length) {
            runtime.push(this.script.watchers.join('\n'));
        }

        if(this.css) runtime.push(`
        $runtime.addStyles('${this.css.id}', \`${this.Q(this.css.getContent())}\`);
    `);

        runtime.push(`
            $$apply();
            return $component;
        })();`);

        if(this.use.resolveClass) {
            if(this.css) {
                let {classMap, metaClass, main} = this.css.getClassMap();
                if(main) main = `'${main}'`;
                else main = 'null';
                classMap = Object.entries(classMap).map(i => `'${i[0]}': '${i[1]}'`).join(', ');
                metaClass = Object.entries(metaClass).map(i => {
                    let value = i[1] === true ? 'true' : `'${i[1]}'`;
                    return `'${i[0]}': ${value}`;
                }).join(', ');
                this.runtime.componentHeader.push(`
                const $$resolveClass = $runtime.makeClassResolver(
                    $option, {${classMap}}, {${metaClass}}, ${main}
                );
            `);
            } else {
                this.runtime.componentHeader.push(`
                const $$resolveClass = $runtime.noop;
            `);
            }
        }

        this.runtime.header = this.runtime.componentHeader.join('\n');
        this.runtime.body = runtime.join('\n');
    }


    function buildBlock(data, option) {
        let tpl = [];
        let lvl = [];
        let binds = [];
        let DN = {};
        let result = {};
        let lastTag = false;

        const go = (level, data, isRoot) => {
            let index = 0;
            const setLvl = () => {lvl[level] = index++;};

            const getElementName = (shift) => {
                let cl;
                if(shift) cl = lvl.slice(0, lvl.length + shift);
                else cl = lvl.slice();

                let d = DN;
                cl.forEach(n => {
                    if(d[n] == null) d[n] = {};
                    d = d[n];
                });
                if(!d.name) d.name = `el${this.uniqIndex++}`;
                return d.name;
            };

            let body = data.body.filter(n => {
                if(n.type == 'script' || n.type == 'style' || n.type == 'slot') return false;
                if(n.type == 'comment' && !this.config.preserveComments) return false;
                if(n.type == 'fragment') {
                    try {
                        let b = this.makeFragment(n);
                        binds.push(b.source);
                    } catch (e) {
                        wrapException(e, n);
                    }
                    return false;
                }
                return true;
            });

            if(isRoot) {
                let svg = false, other = false;
                body.some(node => {
                    if(node.type != 'node') return;
                    if(svgElements[node.name]) svg = true;
                    else return other = true;
                });
                if(svg && !other) result.svg = true;
            }

            {
                let i = 0;
                while(i < body.length - 1) {
                    let node = body[i];
                    let next = body[i + 1];
                    if(node.type == 'text' && next.type == 'text') {
                        node.value += next.value;
                        body.splice(i + 1, 1);
                        continue;
                    }
                    i++;
                }
            }

            let lastText;
            const bindNode = (n) => {
                if(n.type === 'text') {
                    assert(lastText !== tpl.length);
                    setLvl();
                    if(n.value.indexOf('{') >= 0) {
                        tpl.push(' ');
                        let exp = this.parseText(n.value).result;
                        binds.push(`$runtime.bindText($cd, ${getElementName()}, () => ${exp});`);
                    } else tpl.push(n.value);
                    lastText = tpl.length;
                } else if(n.type === 'template') {
                    setLvl();
                    tpl.push(n.openTag);
                    tpl.push(n.content);
                    tpl.push('</template>');
                } else if(n.type === 'node') {
                    setLvl();
                    if(n.name == 'component' || n.name.match(/^[A-Z]/)) {
                        // component
                        if(this.config.hideLabel) tpl.push(`<!---->`);
                        else tpl.push(`<!-- ${n.name} -->`);
                        let b = this.makeComponent(n, getElementName);
                        binds.push(b.bind);
                        lastTag = true;
                        return;
                    }
                    if(n.name == 'slot') {
                        let slotName = n.elArg || 'default';
                        if(this.config.hideLabel) tpl.push(`<!---->`);
                        else tpl.push(`<!-- Slot ${slotName} -->`);
                        let b = this.attachSlot(slotName, getElementName(), n);
                        binds.push(b.source);
                        lastTag = true;
                        return;
                    }
                    if(n.name == 'fragment') {
                        if(this.config.hideLabel) tpl.push(`<!---->`);
                        else tpl.push(`<!-- Fragment ${n.name} -->`);
                        let b = this.attachFragment(n, getElementName());
                        binds.push(b.source);
                        lastTag = true;
                        return;
                    }

                    let el = ['<' + n.name];
                    if(n.attributes.some(a => a.name.startsWith('{...'))) {
                        n.spreadObject = 'spread' + (this.uniqIndex++);
                        if(this.css) n.classes.add(this.css.id);
                        binds.push(`
                        let ${n.spreadObject} = $runtime.$$makeSpreadObject($cd, ${getElementName()}, '${this.css && this.css.id}');
                    `);
                    }
                    n.attributes.forEach(p => {
                        let b = this.bindProp(p, getElementName, n);
                        if(b.prop) el.push(b.prop);
                        if(b.bind) binds.push(b.bind);
                    });
                    let className = Array.from(n.classes).join(' ');
                    if(className) el.push(`class="${className}"`);

                    el = el.join(' ');
                    if(n.closedTag) {
                        el += n.voidTag ? '/>' : `></${n.name}>`;
                    } else el += '>';
                    tpl.push(el);

                    if(!n.closedTag) {
                        go(level + 1, n);
                        tpl.push(`</${n.name}>`);
                    }
                } else if(n.type === 'each') {
                    setLvl();
                    if(data.type == 'node' && data.body.length == 1) {
                        let eachBlock = this.makeEachBlock(n, {
                            elName: getElementName(-1),
                            onlyChild: true
                        });
                        binds.push(eachBlock.source);
                        return;
                    } else {
                        if(this.config.hideLabel) tpl.push(`<!---->`);
                        else tpl.push(`<!-- ${n.value} -->`);
                        let eachBlock = this.makeEachBlock(n, {elName: getElementName()});
                        binds.push(eachBlock.source);
                        lastTag = true;
                        return;
                    }
                } else if(n.type === 'if') {
                    setLvl();
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- ${n.value} -->`);
                    let ifBlock = this.makeifBlock(n, getElementName());
                    binds.push(ifBlock.source);
                    lastTag = true;
                    return;
                } else if(n.type === 'systag') {
                    let r = n.value.match(/^@(\w+)\s+(.*)$/);
                    let name = r[1];
                    let exp = r[2];

                    if(name == 'html') {
                        setLvl();
                        if(this.config.hideLabel) tpl.push(`<!---->`);
                        else tpl.push(`<!-- html -->`);
                        binds.push(this.makeHtmlBlock(exp, getElementName()));
                        lastTag = true;
                        return;
                    } else throw 'Wrong tag';
                } else if(n.type === 'await') {
                    setLvl();
                    if(this.config.hideLabel) tpl.push(`<!---->`);
                    else tpl.push(`<!-- ${n.value} -->`);
                    let block = this.makeAwaitBlock(n, getElementName());
                    binds.push(block.source);
                    lastTag = true;
                    return;
                } else if(n.type === 'comment') {
                    setLvl();
                    tpl.push(n.content);
                }
                lastTag = false;
            };
            body.forEach(node => {
                try {
                    bindNode(node);
                } catch (e) {
                    wrapException(e, node);
                }
            });

            lvl.length = level;
        };
        go(0, data, true);
        if(lastTag && option && option.protectLastTag) tpl.push('<!---->');

        let source = [];
        result.tpl = this.Q(tpl.join(''));

        if(binds.length) {
            result.name = '$$build' + (this.uniqIndex++);
            
            let args = ['$cd', '$parentElement'];
            if(data.args) args.push.apply(args, data.args);
            source.push(`function ${result.name}(${args.join(', ')}) {\n`);

            const buildNodes = (d, lvl) => {
                let keys = Object.keys(d).filter(k => k != 'name');
                if(keys.length > 1 && !d.name) d.name = 'el' + (this.uniqIndex++);

                if(d.name) {
                    let line = lvl.join('');
                    source.push(`let ${d.name} = ${line};\n`);
                    lvl = [d.name];
                }

                keys.forEach(k => {
                    const p = k == 0 ? `[$runtime.firstChild]` : `[$runtime.childNodes][${k}]`;
                    buildNodes(d[k], lvl.concat([p]));
                });
            };
            buildNodes(DN, ['$parentElement']);

            source.push(binds.join('\n'));
            source.push(`};`);
            result.source = source.join('');
        } else {
            result.name = '$runtime.noop';
            result.source = '';
        }
        return result;
    }
    function wrapException(e, n) {
        if(typeof e === 'string') e = new Error(e);
        if(!e.details) {
            console.log('Node: ', n);
            if(n.type == 'text') e.details = n.value.trim();
            else if(n.type == 'node') e.details = n.openTag.trim();
            else if(n.type == 'each') e.details = n.value.trim();
            else if(n.type == 'if') e.details = n.value.trim();
        }
        throw e;
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    	  path: basedir,
    	  exports: {},
    	  require: function (path, base) {
          return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
        }
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var nwsapi = createCommonjsModule(function (module, exports) {
    /*
     * Copyright (C) 2007-2019 Diego Perini
     * All rights reserved.
     *
     * nwsapi.js - Fast CSS Selectors API Engine
     *
     * Author: Diego Perini <diego.perini at gmail com>
     * Version: 2.2.0
     * Created: 20070722
     * Release: 20191102
     *
     * License:
     *  http://javascript.nwbox.com/nwsapi/MIT-LICENSE
     * Download:
     *  http://javascript.nwbox.com/nwsapi/nwsapi.js
     */

    (function Export(global, factory) {

      {
        module.exports = factory;
      }

    })(commonjsGlobal, function Factory(global, Export) {

      var version = 'nwsapi-2.2.0',

      doc = global.document,
      root = doc.documentElement,
      slice = Array.prototype.slice,

      WSP = '[\\x20\\t\\r\\n\\f]',

      CFG = {
        // extensions
        operators: '[~*^$|]=|=',
        combinators: '[\\x20\\t>+~](?=[^>+~])'
      },

      NOT = {
        // not enclosed in double/single/parens/square
        double_enc: '(?=(?:[^"]*["][^"]*["])*[^"]*$)',
        single_enc: "(?=(?:[^']*['][^']*['])*[^']*$)",
        parens_enc: '(?![^\\x28]*\\x29)',
        square_enc: '(?![^\\x5b]*\\x5d)'
      },

      REX = {
        // regular expressions
        HasEscapes: RegExp('\\\\'),
        HexNumbers: RegExp('^[0-9a-fA-F]'),
        EscOrQuote: RegExp('^\\\\|[\\x22\\x27]'),
        RegExpChar: RegExp('(?:(?!\\\\)[\\\\^$.*+?()[\\]{}|\\/])', 'g'),
        TrimSpaces: RegExp('[\\r\\n\\f]|^' + WSP + '+|' + WSP + '+$', 'g'),
        CommaGroup: RegExp('(\\s*,\\s*)' + NOT.square_enc + NOT.parens_enc, 'g'),
        SplitGroup: RegExp('((?:\\x28[^\\x29]*\\x29|\\[[^\\]]*\\]|\\\\.|[^,])+)', 'g'),
        FixEscapes: RegExp('\\\\([0-9a-fA-F]{1,6}' + WSP + '?|.)|([\\x22\\x27])', 'g'),
        CombineWSP: RegExp('[\\n\\r\\f\\x20]+' + NOT.single_enc + NOT.double_enc, 'g'),
        TabCharWSP: RegExp('(\\x20?\\t+\\x20?)' + NOT.single_enc + NOT.double_enc, 'g'),
        PseudosWSP: RegExp('\\s+([-+])\\s+' + NOT.square_enc, 'g')
      },

      STD = {
        combinator: RegExp('\\s?([>+~])\\s?', 'g'),
        apimethods: RegExp('^(?:[a-z]+|\\*)\\|', 'i'),
        namespaces: RegExp('(\\*|[a-z]+)\\|[-a-z]+', 'i')
      },

      GROUPS = {
        // pseudo-classes requiring parameters
        linguistic: '(dir|lang)\\x28\\s?([-\\w]{2,})\\s?(?:\\x29|$)',
        logicalsel: '(matches|not)\\x28\\s?([^()]*|[^\\x28]*\\x28[^\\x29]*\\x29)\\s?(?:\\x29|$)',
        treestruct: '(nth(?:-last)?(?:-child|-of-type))(?:\\x28\\s?(even|odd|(?:[-+]?\\d*)(?:n\\s?[-+]?\\s?\\d*)?)\\s?(?:\\x29|$))',
        // pseudo-classes not requiring parameters
        locationpc: '(link|visited|target)\\b',
        useraction: '(hover|active|focus|focus-within)\\b',
        structural: '(root|empty|(?:(?:first|last|only)(?:-child|-of-type)))\\b',
        inputstate: '(enabled|disabled|read-only|read-write|placeholder-shown|default)\\b',
        inputvalue: '(checked|indeterminate|required|optional|valid|invalid|in-range|out-of-range)\\b',
        // pseudo-elements starting with single colon (:)
        pseudo_sng: '(after|before|first-letter|first-line)\\b',
        // pseudo-elements starting with double colon (::)
        pseudo_dbl: ':(after|before|first-letter|first-line|selection|placeholder|-webkit-[-a-zA-Z0-9]{2,})\\b'
      },

      Patterns = {
        // pseudo-classes
        treestruct: RegExp('^:(?:' + GROUPS.treestruct + ')(.*)', 'i'),
        structural: RegExp('^:(?:' + GROUPS.structural + ')(.*)', 'i'),
        linguistic: RegExp('^:(?:' + GROUPS.linguistic + ')(.*)', 'i'),
        useraction: RegExp('^:(?:' + GROUPS.useraction + ')(.*)', 'i'),
        inputstate: RegExp('^:(?:' + GROUPS.inputstate + ')(.*)', 'i'),
        inputvalue: RegExp('^:(?:' + GROUPS.inputvalue + ')(.*)', 'i'),
        locationpc: RegExp('^:(?:' + GROUPS.locationpc + ')(.*)', 'i'),
        logicalsel: RegExp('^:(?:' + GROUPS.logicalsel + ')(.*)', 'i'),
        pseudo_dbl: RegExp('^:(?:' + GROUPS.pseudo_dbl + ')(.*)', 'i'),
        pseudo_sng: RegExp('^:(?:' + GROUPS.pseudo_sng + ')(.*)', 'i'),
        // combinator symbols
        children: RegExp('^' + WSP + '?\\>' + WSP + '?(.*)'),
        adjacent: RegExp('^' + WSP + '?\\+' + WSP + '?(.*)'),
        relative: RegExp('^' + WSP + '?\\~' + WSP + '?(.*)'),
        ancestor: RegExp('^' + WSP + '+(.*)'),
       // universal & namespace
       universal: RegExp('^\\*(.*)'),
       namespace: RegExp('^(\\w+|\\*)?\\|(.*)')
      },

      // regexp to aproximate detection of RTL languages (Arabic)
      RTL = RegExp('^[\\u0591-\\u08ff\\ufb1d-\\ufdfd\\ufe70-\\ufefc ]+$'),

      // emulate firefox error strings
      qsNotArgs = 'Not enough arguments',
      qsInvalid = ' is not a valid selector',

      // detect structural pseudo-classes in selectors
      reNthElem = RegExp('(:nth(?:-last)?-child)', 'i'),
      reNthType = RegExp('(:nth(?:-last)?-of-type)', 'i'),

      // placeholder for global regexp
      reOptimizer,
      reValidator,

      // special handling configuration flags
      Config = {
        IDS_DUPES: true,
        MIXEDCASE: true,
        LOGERRORS: true,
        VERBOSITY: true
      },

      NAMESPACE,
      QUIRKS_MODE,
      HTML_DOCUMENT,

      ATTR_STD_OPS = {
        '=': 1, '^=': 1, '$=': 1, '|=': 1, '*=': 1, '~=': 1
      },

      HTML_TABLE = {
        'accept': 1, 'accept-charset': 1, 'align': 1, 'alink': 1, 'axis': 1,
        'bgcolor': 1, 'charset': 1, 'checked': 1, 'clear': 1, 'codetype': 1, 'color': 1,
        'compact': 1, 'declare': 1, 'defer': 1, 'dir': 1, 'direction': 1, 'disabled': 1,
        'enctype': 1, 'face': 1, 'frame': 1, 'hreflang': 1, 'http-equiv': 1, 'lang': 1,
        'language': 1, 'link': 1, 'media': 1, 'method': 1, 'multiple': 1, 'nohref': 1,
        'noresize': 1, 'noshade': 1, 'nowrap': 1, 'readonly': 1, 'rel': 1, 'rev': 1,
        'rules': 1, 'scope': 1, 'scrolling': 1, 'selected': 1, 'shape': 1, 'target': 1,
        'text': 1, 'type': 1, 'valign': 1, 'valuetype': 1, 'vlink': 1
      },

      Combinators = { },

      Selectors = { },

      Operators = {
         '=': { p1: '^',
                p2: '$',
                p3: 'true' },
        '^=': { p1: '^',
                p2: '',
                p3: 'true' },
        '$=': { p1: '',
                p2: '$',
                p3: 'true' },
        '*=': { p1: '',
                p2: '',
                p3: 'true' },
        '|=': { p1: '^',
                p2: '(-|$)',
                p3: 'true' },
        '~=': { p1: '(^|\\s)',
                p2: '(\\s|$)',
                p3: 'true' }
      },

      concatCall =
        function(nodes, callback) {
          var i = 0, l = nodes.length, list = Array(l);
          while (l > i) {
            if (false === callback(list[i] = nodes[i])) break;
            ++i;
          }
          return list;
        },

      concatList =
        function(list, nodes) {
          var i = -1, l = nodes.length;
          while (l--) { list[list.length] = nodes[++i]; }
          return list;
        },

      documentOrder =
        function(a, b) {
          if (!hasDupes && a === b) {
            hasDupes = true;
            return 0;
          }
          return a.compareDocumentPosition(b) & 4 ? -1 : 1;
        },

      hasDupes = false,

      unique =
        function(nodes) {
          var i = 0, j = -1, l = nodes.length + 1, list = [ ];
          while (--l) {
            if (nodes[i++] === nodes[i]) continue;
            list[++j] = nodes[i - 1];
          }
          hasDupes = false;
          return list;
        },

      // check context for mixed content
      hasMixedCaseTagNames =
        function(context) {
          var ns, api = 'getElementsByTagNameNS';

          // current host context (ownerDocument)
          context = context.ownerDocument || context;

          // documentElement (root) element namespace or default html/xhtml namespace
          ns = context.documentElement.namespaceURI || 'http://www.w3.org/1999/xhtml';

          // checking the number of non HTML nodes in the document
          return (context[api]('*', '*').length - context[api](ns, '*').length) > 0;
        },

      switchContext =
        function(context, force) {
          var oldDoc = doc;
          doc = context.ownerDocument || context;
          if (force || oldDoc !== doc) {
            // force a new check for each document change
            // performed before the next select operation
            root = doc.documentElement;
            HTML_DOCUMENT = isHTML(doc);
            QUIRKS_MODE = HTML_DOCUMENT &&
              doc.compatMode.indexOf('CSS') < 0;
            NAMESPACE = root && root.namespaceURI;
            Snapshot.doc = doc;
            Snapshot.root = root;
          }
          return (Snapshot.from = context);
        },

      // convert single codepoint to UTF-16 encoding
      codePointToUTF16 =
        function(codePoint) {
          // out of range, use replacement character
          if (codePoint < 1 || codePoint > 0x10ffff ||
            (codePoint > 0xd7ff && codePoint < 0xe000)) {
            return '\\ufffd';
          }
          // javascript strings are UTF-16 encoded
          if (codePoint < 0x10000) {
            var lowHex = '000' + codePoint.toString(16);
            return '\\u' + lowHex.substr(lowHex.length - 4);
          }
          // supplementary high + low surrogates
          return '\\u' + (((codePoint - 0x10000) >> 0x0a) + 0xd800).toString(16) +
                 '\\u' + (((codePoint - 0x10000) % 0x400) + 0xdc00).toString(16);
        },

      // convert single codepoint to string
      stringFromCodePoint =
        function(codePoint) {
          // out of range, use replacement character
          if (codePoint < 1 || codePoint > 0x10ffff ||
            (codePoint > 0xd7ff && codePoint < 0xe000)) {
            return '\ufffd';
          }
          if (codePoint < 0x10000) {
            return String.fromCharCode(codePoint);
          }
          return String.fromCodePoint ?
            String.fromCodePoint(codePoint) :
            String.fromCharCode(
              ((codePoint - 0x10000) >> 0x0a) + 0xd800,
              ((codePoint - 0x10000) % 0x400) + 0xdc00);
        },

      // convert escape sequence in a CSS string or identifier
      // to javascript string with javascript escape sequences
      convertEscapes =
        function(str) {
          return REX.HasEscapes.test(str) ?
            str.replace(REX.FixEscapes,
              function(substring, p1, p2) {
                // unescaped " or '
                return p2 ? '\\' + p2 :
                  // javascript strings are UTF-16 encoded
                  REX.HexNumbers.test(p1) ? codePointToUTF16(parseInt(p1, 16)) :
                  // \' \"
                  REX.EscOrQuote.test(p1) ? substring :
                  // \g \h \. \# etc
                  p1;
              }
            ) : str;
        },

      // convert escape sequence in a CSS string or identifier
      // to javascript string with characters representations
      unescapeIdentifier =
        function(str) {
          return REX.HasEscapes.test(str) ?
            str.replace(REX.FixEscapes,
              function(substring, p1, p2) {
                // unescaped " or '
                return p2 ? p2 :
                  // javascript strings are UTF-16 encoded
                  REX.HexNumbers.test(p1) ? stringFromCodePoint(parseInt(p1, 16)) :
                  // \' \"
                  REX.EscOrQuote.test(p1) ? substring :
                  // \g \h \. \# etc
                  p1;
              }
            ) : str;
        },

      method = {
        '#': 'getElementById',
        '*': 'getElementsByTagNameNS',
        '.': 'getElementsByClassName'
        },

      compat = {
        '#': function(c, n) { REX.HasEscapes.test(n) && (n = unescapeIdentifier(n)); return function(e, f) { return byId(n, c); }; },
        '*': function(c, n) { REX.HasEscapes.test(n) && (n = unescapeIdentifier(n)); return function(e, f) { return byTag(n, c); }; },
        '.': function(c, n) { REX.HasEscapes.test(n) && (n = unescapeIdentifier(n)); return function(e, f) { return byClass(n, c); }; }
        },

      // find duplicate ids using iterative walk
      byIdRaw =
        function(id, context) {
          var node = context, nodes = [ ], next = node.firstElementChild;
          while ((node = next)) {
            node.id == id && (nodes[nodes.length] = node);
            if ((next = node.firstElementChild || node.nextElementSibling)) continue;
            while (!next && (node = node.parentElement) && node !== context) {
              next = node.nextElementSibling;
            }
          }
          return nodes;
        },

      // context agnostic getElementById
      byId =
        function(id, context) {
          var e, nodes, api = method['#'];

          // duplicates id allowed
          if (Config.IDS_DUPES === false) {
            if (api in context) {
              return (e = context[api](id)) ? [ e ] : none;
            }
          } else {
            if ('all' in context) {
              if ((e = context.all[id])) {
                if (e.nodeType == 1) return e.getAttribute('id') != id ? [ ] : [ e ];
                else if (id == 'length') return (e = context[api](id)) ? [ e ] : none;
                for (i = 0, l = e.length, nodes = [ ]; l > i; ++i) {
                  if (e[i].id == id) nodes[nodes.length] = e[i];
                }
                return nodes && nodes.length ? nodes : [ nodes ];
              } else return none;
            }
          }

          return byIdRaw(id, context);
        },

      // context agnostic getElementsByTagName
      byTag =
        function(tag, context) {
          var e, nodes, api = method['*'];
          // DOCUMENT_NODE (9) & ELEMENT_NODE (1)
          if (api in context) {
            return slice.call(context[api]('*', tag));
          } else {
            // DOCUMENT_FRAGMENT_NODE (11)
            if ((e = context.firstElementChild)) {
              tag = tag.toLowerCase();
              if (!(e.nextElementSibling || tag == '*' || e.nodeName.toLowerCase() == tag)) {
                return slice.call(e[api]('*', tag));
              } else {
                nodes = [ ];
                do {
                  if (tag == '*' || e.nodeName.toLowerCase() == tag) nodes[nodes.length] = e;
                  concatList(nodes, e[api]('*', tag));
                } while ((e = e.nextElementSibling));
              }
            } else nodes = none;
          }
          return nodes;
        },

      // context agnostic getElementsByClassName
      byClass =
        function(cls, context) {
          var e, nodes, api = method['.'], reCls;
          // DOCUMENT_NODE (9) & ELEMENT_NODE (1)
          if (api in context) {
            return slice.call(context[api](cls));
          } else {
            // DOCUMENT_FRAGMENT_NODE (11)
            if ((e = context.firstElementChild)) {
              reCls = RegExp('(^|\\s)' + cls + '(\\s|$)', QUIRKS_MODE ? 'i' : '');
              if (!(e.nextElementSibling || reCls.test(e.className))) {
                return slice.call(e[api](cls));
              } else {
                nodes = [ ];
                do {
                  if (reCls.test(e.className)) nodes[nodes.length] = e;
                  concatList(nodes, e[api](cls));
                } while ((e = e.nextElementSibling));
              }
            } else nodes = none;
          }
          return nodes;
        },

      // namespace aware hasAttribute
      // helper for XML/XHTML documents
      hasAttributeNS =
        function(e, name) {
          var i, l, attr = e.getAttributeNames();
          name = RegExp(':?' + name + '$', HTML_DOCUMENT ? 'i' : '');
          for (i = 0, l = attr.length; l > i; ++i) {
            if (name.test(attr[i])) return true;
          }
          return false;
        },

      // fast resolver for the :nth-child() and :nth-last-child() pseudo-classes
      nthElement = (function() {
        var idx = 0, len = 0, set = 0, parent = undefined, parents = Array(), nodes = Array();
        return function(element, dir) {
          // ensure caches are emptied after each run, invoking with dir = 2
          if (dir == 2) {
            idx = 0; len = 0; set = 0; nodes.length = 0;
            parents.length = 0; parent = undefined;
            return -1;
          }
          var e, i, j, k, l;
          if (parent === element.parentElement) {
            i = set; j = idx; l = len;
          } else {
            l = parents.length;
            parent = element.parentElement;
            for (i = -1, j = 0, k = l - 1; l > j; ++j, --k) {
              if (parents[j] === parent) { i = j; break; }
              if (parents[k] === parent) { i = k; break; }
            }
            if (i < 0) {
              parents[i = l] = parent;
              l = 0; nodes[i] = Array();
              e = parent && parent.firstElementChild || element;
              while (e) { nodes[i][l] = e; if (e === element) j = l; e = e.nextElementSibling; ++l; }
              set = i; idx = 0; len = l;
              if (l < 2) return l;
            } else {
              l = nodes[i].length;
              set = i;
            }
          }
          if (element !== nodes[i][j] && element !== nodes[i][j = 0]) {
            for (j = 0, e = nodes[i], k = l - 1; l > j; ++j, --k) {
              if (e[j] === element) { break; }
              if (e[k] === element) { j = k; break; }
            }
          }
          idx = j + 1; len = l;
          return dir ? l - j : idx;
        };
      })(),

      // fast resolver for the :nth-of-type() and :nth-last-of-type() pseudo-classes
      nthOfType = (function() {
        var idx = 0, len = 0, set = 0, parent = undefined, parents = Array(), nodes = Array();
        return function(element, dir) {
          // ensure caches are emptied after each run, invoking with dir = 2
          if (dir == 2) {
            idx = 0; len = 0; set = 0; nodes.length = 0;
            parents.length = 0; parent = undefined;
            return -1;
          }
          var e, i, j, k, l, name = element.nodeName;
          if (nodes[set] && nodes[set][name] && parent === element.parentElement) {
            i = set; j = idx; l = len;
          } else {
            l = parents.length;
            parent = element.parentElement;
            for (i = -1, j = 0, k = l - 1; l > j; ++j, --k) {
              if (parents[j] === parent) { i = j; break; }
              if (parents[k] === parent) { i = k; break; }
            }
            if (i < 0 || !nodes[i][name]) {
              parents[i = l] = parent;
              nodes[i] || (nodes[i] = Object());
              l = 0; nodes[i][name] = Array();
              e = parent && parent.firstElementChild || element;
              while (e) { if (e === element) j = l; if (e.nodeName == name) { nodes[i][name][l] = e; ++l; } e = e.nextElementSibling; }
              set = i; idx = j; len = l;
              if (l < 2) return l;
            } else {
              l = nodes[i][name].length;
              set = i;
            }
          }
          if (element !== nodes[i][name][j] && element !== nodes[i][name][j = 0]) {
            for (j = 0, e = nodes[i][name], k = l - 1; l > j; ++j, --k) {
              if (e[j] === element) { break; }
              if (e[k] === element) { j = k; break; }
            }
          }
          idx = j + 1; len = l;
          return dir ? l - j : idx;
        };
      })(),

      // check if the document type is HTML
      isHTML =
        function(node) {
          var doc = node.ownerDocument || node;
          return doc.nodeType == 9 &&
            // contentType not in IE <= 11
            'contentType' in doc ?
              doc.contentType.indexOf('/html') > 0 :
              doc.createElement('DiV').nodeName == 'DIV';
        },

      // configure the engine to use special handling
      configure =
        function(option, clear) {
          if (typeof option == 'string') { return !!Config[option]; }
          if (typeof option != 'object') { return Config; }
          for (var i in option) {
            Config[i] = !!option[i];
          }
          // clear lambda cache
          if (clear) {
            matchResolvers = { };
            selectResolvers = { };
          }
          setIdentifierSyntax();
          return true;
        },

      // centralized error and exceptions handling
      emit =
        function(message, proto) {
          var err;
          if (Config.VERBOSITY) {
            if (proto) {
              err = new proto(message);
            } else {
              err = new global.DOMException(message, 'SyntaxError');
            }
            throw err;
          }
          if (Config.LOGERRORS && console && console.log) {
            console.log(message);
          }
        },

      // execute the engine initialization code
      initialize =
        function(doc) {
          setIdentifierSyntax();
          lastContext = switchContext(doc, true);
        },

      // build validation regexps used by the engine
      setIdentifierSyntax =
        function() {

          //
          // NOTE: SPECIAL CASES IN CSS SYNTAX PARSING RULES
          //
          // The <EOF-token> https://drafts.csswg.org/css-syntax/#typedef-eof-token
          // allow mangled|unclosed selector syntax at the end of selectors strings
          //
          // Literal equivalent hex representations of the characters: " ' ` ] )
          //
          //     \\x22 = " - double quotes    \\x5b = [ - open square bracket
          //     \\x27 = ' - single quote     \\x5d = ] - closed square bracket
          //     \\x60 = ` - back tick        \\x28 = ( - open round parens
          //     \\x5c = \ - back slash       \\x29 = ) - closed round parens
          //
          // using hex format prevents false matches of opened/closed instances
          // pairs, coloring breakage and other editors highlightning problems.
          //

          var identifier =
            // doesn't start with a digit
            '(?=[^0-9])' +
            // can start with double dash
            '(?:-{2}' +
              // may include ascii chars
              '|[a-zA-Z0-9-_]' +
              // non-ascii chars
              '|[^\\x00-\\x9f]' +
              // escaped chars
              '|\\\\[^\\r\\n\\f0-9a-fA-F]' +
              // unicode chars
              '|\\\\[0-9a-fA-F]{1,6}(?:\\r\\n|\\s)?' +
              // any escaped chars
              '|\\\\.' +
            ')+',

          pseudonames = '[-\\w]+',
          pseudoparms = '(?:[-+]?\\d*)(?:n\\s?[-+]?\\s?\\d*)',
          doublequote = '"[^"\\\\]*(?:\\\\.[^"\\\\]*)*(?:"|$)',
          singlequote = "'[^'\\\\]*(?:\\\\.[^'\\\\]*)*(?:'|$)",

          attrparser = identifier + '|' + doublequote + '|' + singlequote,

          attrvalues = '([\\x22\\x27]?)((?!\\3)*|(?:\\\\?.)*?)(?:\\3|$)',

          attributes =
            '\\[' +
              // attribute presence
              '(?:\\*\\|)?' +
              WSP + '?' +
              '(' + identifier + '(?::' + identifier + ')?)' +
              WSP + '?' +
              '(?:' +
                '(' + CFG.operators + ')' + WSP + '?' +
                '(?:' + attrparser + ')' +
              ')?' +
              // attribute case sensitivity
              WSP + '?' + '(i)?' + WSP + '?' +
            '(?:\\]|$)',

          attrmatcher = attributes.replace(attrparser, attrvalues),

          pseudoclass =
            '(?:\\x28' + WSP + '*' +
              '(?:' + pseudoparms + '?)?|' +
              // universal * &
              // namespace *|*
              '(?:\\*|\\|)|' +
              '(?:' +
                '(?::' + pseudonames +
                '(?:\\x28' + pseudoparms + '?(?:\\x29|$))?|' +
              ')|' +
              '(?:[.#]?' + identifier + ')|' +
              '(?:' + attributes + ')' +
              ')+|' +
              '(?:' + WSP + '?,' + WSP + '?)|' +
              '(?:' + WSP + '?)|' +
              '(?:\\x29|$))*',

          standardValidator =
            '(?=' + WSP + '?[^>+~(){}<>])' +
            '(?:' +
              // universal * &
              // namespace *|*
              '(?:\\*|\\|)|' +
              '(?:[.#]?' + identifier + ')+|' +
              '(?:' + attributes + ')+|' +
              '(?:::?' + pseudonames + pseudoclass + ')|' +
              '(?:' + WSP + '?' + CFG.combinators + WSP + '?)|' +
              '(?:' + WSP + '?,' + WSP + '?)|' +
              '(?:' + WSP + '?)' +
            ')+';

          // the following global RE is used to return the
          // deepest nodeName in selector strings and then
          // use it to retrieve all possible matching nodes
          // that will be filtered by compiled resolvers
          reOptimizer = RegExp(
            '(?:([.:#*]?)' +
            '(' + identifier + ')' +
            '(?:' +
              ':[-\\w]+|' +
              '\\[[^\\]]+(?:\\]|$)|' +
              '\\x28[^\\x29]+(?:\\x29|$)' +
            ')*)$');

          // global
          reValidator = RegExp(standardValidator, 'g');

          Patterns.id = RegExp('^#(' + identifier + ')(.*)');
          Patterns.tagName = RegExp('^(' + identifier + ')(.*)');
          Patterns.className = RegExp('^\\.(' + identifier + ')(.*)');
          Patterns.attribute = RegExp('^(?:' + attrmatcher + ')(.*)');
        },

      F_INIT = '"use strict";return function Resolver(c,f,x,r)',

      S_HEAD = 'var lvl=[],e,n,o,j=r.length-1,k=-1',
      M_HEAD = 'var e,n,o',

      S_LOOP = 'main:while((e=c[++k]))',
      N_LOOP = 'main:while((e=c.item(++k)))',
      M_LOOP = 'e=c;',

      S_BODY = 'r[++j]={node:c[k],lvl:lvl};lvl=[];',
      N_BODY = 'r[++j]=c.item(k);',
      M_BODY = '',

      S_TAIL = 'continue main;',
      M_TAIL = 'r=true;',

      S_TEST = 'if(f(c[k])){break main;}',
      N_TEST = 'if(f(c.item(k))){break main;}',
      M_TEST = 'f(c);',

      S_VARS = [ ],
      M_VARS = [ ],

      // compile groups or single selector strings into
      // executable functions for matching or selecting
      compile =
        function(selector, mode, callback) {
          var factory, head = '', loop = '', macro = '', source = '', vars = '';

          // 'mode' can be boolean or null
          // true = select / false = match
          // null to use collection.item()
          switch (mode) {
            case true:
              if (selectLambdas[selector]) { return selectLambdas[selector]; }
              macro = S_BODY + (callback ? S_TEST : '') + S_TAIL;
              head = S_HEAD;
              loop = S_LOOP;
              break;
            case false:
              if (matchLambdas[selector]) { return matchLambdas[selector]; }
              macro = M_BODY + (callback ? M_TEST : '') + M_TAIL;
              head = M_HEAD;
              loop = M_LOOP;
              break;
            case null:
              if (selectLambdas[selector]) { return selectLambdas[selector]; }
              macro = N_BODY + (callback ? N_TEST : '') + S_TAIL;
              head = S_HEAD;
              loop = N_LOOP;
              break;
          }

          source = compileSelector(selector, macro, mode, callback, false);

          loop += mode || mode === null ? '{' + source + '}' : source;

          if (mode || mode === null && selector.includes(':nth')) {
            loop += reNthElem.test(selector) ? 's.nthElement(null, 2);' : '';
            loop += reNthType.test(selector) ? 's.nthOfType(null, 2);' : '';
          }

          if (S_VARS[0] || M_VARS[0]) {
            vars = ',' + (S_VARS.join(',') || M_VARS.join(','));
            S_VARS.length = 0;
            M_VARS.length = 0;
          }

          factory = Function('s', F_INIT + '{' + head + vars + ';' + loop + 'return r;}')(Snapshot);

          return mode || mode === null ? (selectLambdas[selector] = factory) : (matchLambdas[selector] = factory);
        },

      // build conditional code to check components of selector strings
      compileSelector =
        function(expression, source, mode, callback, not) {

          // N is the negation pseudo-class flag
          // D is the default inverted negation flag
          var a, b, n, f, i, l, name, nested, NS,
          N = not ? '!' : '', D = not ? '' : '!',
          compat, expr, match, result, status, symbol, test,
          type, selector = expression, selector_string, vars;

          // original 'select' or 'match' selector string before normalization
          selector_string = mode ? lastSelected : lastMatched;

          // isolate selector combinators/components and normalize whitespace
          selector = selector.replace(STD.combinator, '$1');//.replace(STD.whitespace, ' ');

          var index = 0;
          while (selector) {
            source = 'lvl[' + (index++) + ']=e;' + source;  // collect all related nodes

            // get namespace prefix if present or get first char of selector
            symbol = STD.apimethods.test(selector) ? '|' : selector[0];

            switch (symbol) {

              // universal resolver
              case '*':
                match = selector.match(Patterns.universal);
                if (N == '!') {
                  source = 'if(' + N + 'true' +
                    '){' + source + '}';
                }
                break;

              // id resolver
              case '#':
                match = selector.match(Patterns.id);
                source = 'if(' + N + '(/^' + match[1] + '$/.test(e.getAttribute("id"))' +
                  ')){' + source + '}';
                break;

              // class name resolver
              case '.':
                match = selector.match(Patterns.className);
                compat = (QUIRKS_MODE ? 'i' : '') + '.test(e.getAttribute("class"))';
                source = 'if(' + N + '(/(^|\\s)' + match[1] + '(\\s|$)/' + compat +
                  ')){' + source + '}';
                break;

              // tag name resolver
              case (/[a-z]/i.test(symbol) ? symbol : undefined):
                match = selector.match(Patterns.tagName);
                source = 'if(' + N + '(e.nodeName' +
                  (Config.MIXEDCASE || hasMixedCaseTagNames(doc) ?
                    '.toLowerCase()=="' + match[1].toLowerCase() + '"' :
                    '=="' + match[1].toUpperCase() + '"') +
                  ')){' + source + '}';
                break;

              // namespace resolver
              case '|':
                match = selector.match(Patterns.namespace);
                if (match[1] == '*') {
                  source = 'if(' + N + 'true){' + source + '}';
                } else if (!match[1]) {
                  source = 'if(' + N + '(!e.namespaceURI)){' + source + '}';
                } else if (typeof match[1] == 'string' && root.prefix == match[1]) {
                  source = 'if(' + N + '(e.namespaceURI=="' + NAMESPACE + '")){' + source + '}';
                } else {
                  emit('\'' + selector_string + '\'' + qsInvalid);
                }
                break;

              // attributes resolver
              case '[':
                match = selector.match(Patterns.attribute);
                NS = match[0].match(STD.namespaces);
                name = match[1];
                expr = name.split(':');
                expr = expr.length == 2 ? expr[1] : expr[0];
                if (match[2] && !(test = Operators[match[2]])) {
                  emit('\'' + selector_string + '\'' + qsInvalid);
                  return '';
                }
                if (match[4] === '') {
                  test = match[2] == '~=' ?
                    { p1: '^\\s', p2: '+$', p3: 'true' } :
                      match[2] in ATTR_STD_OPS && match[2] != '~=' ?
                    { p1: '^',    p2: '$',  p3: 'true' } : test;
                } else if (match[2] == '~=' && match[4].includes(' ')) {
                  // whitespace separated list but value contains space
                  source = 'if(' + N + 'false){' + source + '}';
                  break;
                } else if (match[4]) {
                  match[4] = convertEscapes(match[4]).replace(REX.RegExpChar, '\\$&');
                }
                type = match[5] == 'i' || (HTML_DOCUMENT && HTML_TABLE[expr.toLowerCase()]) ? 'i' : '';
                source = 'if(' + N + '(' +
                  (!match[2] ? (NS ? 's.hasAttributeNS(e,"' + name + '")' : 'e.hasAttribute("' + name + '")') :
                  !match[4] && ATTR_STD_OPS[match[2]] && match[2] != '~=' ? 'e.getAttribute("' + name + '")==""' :
                  '(/' + test.p1 + match[4] + test.p2 + '/' + type + ').test(e.getAttribute("' + name + '"))==' + test.p3) +
                  ')){' + source + '}';
                break;

              // *** General sibling combinator
              // E ~ F (F relative sibling of E)
              case '~':
                match = selector.match(Patterns.relative);
                source = 'n=e;while((e=e.previousElementSibling)){' + source + '}e=n;';
                break;
              // *** Adjacent sibling combinator
              // E + F (F adiacent sibling of E)
              case '+':
                match = selector.match(Patterns.adjacent);
                source = 'n=e;if((e=e.previousElementSibling)){' + source + '}e=n;';
                break;
              // *** Descendant combinator
              // E F (E ancestor of F)
              case '\x09':
              case '\x20':
                match = selector.match(Patterns.ancestor);
                source = 'n=e;while((e=e.parentElement)){' + source + '}e=n;';
                break;
              // *** Child combinator
              // E > F (F children of E)
              case '>':
                match = selector.match(Patterns.children);
                source = 'n=e;if((e=e.parentElement)){' + source + '}e=n;';
                break;

              // *** user supplied combinators extensions
              case (symbol in Combinators ? symbol : undefined):
                // for other registered combinators extensions
                match[match.length - 1] = '*';
                source = Combinators[symbol](match) + source;
                break;

              // *** tree-structural pseudo-classes
              // :root, :empty, :first-child, :last-child, :only-child, :first-of-type, :last-of-type, :only-of-type
              case ':':
                if ((match = selector.match(Patterns.structural))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'root':
                      // there can only be one :root element, so exit the loop once found
                      source = 'if(' + N + '(e===s.root)){' + source + (mode ? 'break main;' : '') + '}';
                      break;
                    case 'empty':
                      // matches elements that don't contain elements or text nodes
                      source = 'n=e.firstChild;while(n&&!(/1|3/).test(n.nodeType)){n=n.nextSibling}if(' + D + 'n){' + source + '}';
                      break;

                    // *** child-indexed pseudo-classes
                    // :first-child, :last-child, :only-child
                    case 'only-child':
                      source = 'if(' + N + '(!e.nextElementSibling&&!e.previousElementSibling)){' + source + '}';
                      break;
                    case 'last-child':
                      source = 'if(' + N + '(!e.nextElementSibling)){' + source + '}';
                      break;
                    case 'first-child':
                      source = 'if(' + N + '(!e.previousElementSibling)){' + source + '}';
                      break;

                    // *** typed child-indexed pseudo-classes
                    // :only-of-type, :last-of-type, :first-of-type
                    case 'only-of-type':
                      source = 'o=e.nodeName;' +
                        'n=e;while((n=n.nextElementSibling)&&n.nodeName!=o);if(!n){' +
                        'n=e;while((n=n.previousElementSibling)&&n.nodeName!=o);}if(' + D + 'n){' + source + '}';
                      break;
                    case 'last-of-type':
                      source = 'n=e;o=e.nodeName;while((n=n.nextElementSibling)&&n.nodeName!=o);if(' + D + 'n){' + source + '}';
                      break;
                    case 'first-of-type':
                      source = 'n=e;o=e.nodeName;while((n=n.previousElementSibling)&&n.nodeName!=o);if(' + D + 'n){' + source + '}';
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** child-indexed & typed child-indexed pseudo-classes
                // :nth-child, :nth-of-type, :nth-last-child, :nth-last-of-type
                else if ((match = selector.match(Patterns.treestruct))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'nth-child':
                    case 'nth-of-type':
                    case 'nth-last-child':
                    case 'nth-last-of-type':
                      expr = /-of-type/i.test(match[1]);
                      if (match[1] && match[2]) {
                        type = /last/i.test(match[1]);
                        if (match[2] == 'n') {
                          source = 'if(' + N + 'true){' + source + '}';
                          break;
                        } else if (match[2] == '1') {
                          test = type ? 'next' : 'previous';
                          source = expr ? 'n=e;o=e.nodeName;' +
                            'while((n=n.' + test + 'ElementSibling)&&n.nodeName!=o);if(' + D + 'n){' + source + '}' :
                            'if(' + N + '!e.' + test + 'ElementSibling){' + source + '}';
                          break;
                        } else if (match[2] == 'even' || match[2] == '2n0' || match[2] == '2n+0' || match[2] == '2n') {
                          test = 'n%2==0';
                        } else if (match[2] == 'odd'  || match[2] == '2n1' || match[2] == '2n+1') {
                          test = 'n%2==1';
                        } else {
                          f = /n/i.test(match[2]);
                          n = match[2].split('n');
                          a = parseInt(n[0], 10) || 0;
                          b = parseInt(n[1], 10) || 0;
                          if (n[0] == '-') { a = -1; }
                          if (n[0] == '+') { a = +1; }
                          test = (b ? '(n' + (b > 0 ? '-' : '+') + Math.abs(b) + ')' : 'n') + '%' + a + '==0' ;
                          test =
                            a >= +1 ? (f ? 'n>' + (b - 1) + (Math.abs(a) != 1 ? '&&' + test : '') : 'n==' + a) :
                            a <= -1 ? (f ? 'n<' + (b + 1) + (Math.abs(a) != 1 ? '&&' + test : '') : 'n==' + a) :
                            a === 0 ? (n[0] ? 'n==' + b : 'n>' + (b - 1)) : 'false';
                        }
                        expr = expr ? 'OfType' : 'Element';
                        type = type ? 'true' : 'false';
                        source = 'n=s.nth' + expr + '(e,' + type + ');if(' + N + '(' + test + ')){' + source + '}';
                      } else {
                        emit('\'' + selector_string + '\'' + qsInvalid);
                      }
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** logical combination pseudo-classes
                // :matches( s1, [ s2, ... ]), :not( s1, [ s2, ... ])
                else if ((match = selector.match(Patterns.logicalsel))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'matches':
                      if (not === true || nested === true) {
                        emit(':matches() pseudo-class cannot be nested');
                      }
                      nested = true;
                      expr = match[2].replace(REX.CommaGroup, ',').replace(REX.TrimSpaces, '');
                      // check nested compound selectors s1, s2
                      expr = match[2].match(REX.SplitGroup);
                      for (i = 0, l = expr.length; l > i; ++i) {
                        expr[i] = expr[i].replace(REX.TrimSpaces, '');
                        source = 'if(s.match("' + expr[i].replace(/\x22/g, '\\"') + '",e)){' + source + '}';
                      }
                      break;
                    case 'not':
                      if (not === true || nested === true) {
                        emit(':not() pseudo-class cannot be nested');
                      }
                      expr = match[2].replace(REX.CommaGroup, ',').replace(REX.TrimSpaces, '');
                      // check nested compound selectors s1, s2
                      expr = match[2].match(REX.SplitGroup);
                      for (i = 0, l = expr.length; l > i; ++i) {
                        expr[i] = expr[i].replace(REX.TrimSpaces, '');
                        source = compileSelector(expr[i], source, false, callback, true);
                      }
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** linguistic pseudo-classes
                // :dir( ltr / rtl ), :lang( en )
                else if ((match = selector.match(Patterns.linguistic))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'dir':
                      source = 'var p;if(' + N + '(' +
                        '(/' + match[2] + '/i.test(e.dir))||(p=s.ancestor("[dir]", e))&&' +
                        '(/' + match[2] + '/i.test(p.dir))||(e.dir==""||e.dir=="auto")&&' +
                        '(' + (match[2] == 'ltr' ? '!':'')+ RTL +'.test(e.textContent)))' +
                        '){' + source + '};';
                      break;
                    case 'lang':
                      expr = '(?:^|-)' + match[2] + '(?:-|$)';
                      source = 'var p;if(' + N + '(' +
                        '(e.isConnected&&(e.lang==""&&(p=s.ancestor("[lang]",e)))&&' +
                        '(p.lang=="' + match[2] + '")||/'+ expr +'/i.test(e.lang)))' +
                        '){' + source + '};';
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** location pseudo-classes
                // :link, :visited, :target
                else if ((match = selector.match(Patterns.locationpc))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'link':
                      source = 'if(' + N + '(/^a|area|link$/i.test(e.nodeName)&&e.hasAttribute("href"))){' + source + '}';
                      break;
                    case 'visited':
                      source = 'if(' + N + '(/^a|area|link$/i.test(e.nodeName)&&e.hasAttribute("href")&&e.visited)){' + source + '}';
                      break;
                    case 'target':
                      source = 'if(' + N + '((s.doc.compareDocumentPosition(e)&16)&&s.doc.location.hash&&e.id==s.doc.location.hash.slice(1))){' + source + '}';
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** user actions pseudo-classes
                // :hover, :active, :focus
                else if ((match = selector.match(Patterns.useraction))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'hover':
                      source = 'hasFocus' in doc && doc.hasFocus() ?
                        'if(' + N + '(e===s.doc.hoverElement)){' + source + '}' :
                        'if(' + D + 'true){' + source + '}';
                      break;
                    case 'active':
                      source = 'hasFocus' in doc && doc.hasFocus() ?
                        'if(' + N + '(e===s.doc.activeElement)){' + source + '}' :
                        'if(' + D + 'true){' + source + '}';
                      break;
                    case 'focus':
                      source = 'hasFocus' in doc ?
                        'if(' + N + '(e===s.doc.activeElement&&s.doc.hasFocus()&&(e.type||e.href||typeof e.tabIndex=="number"))){' + source + '}' :
                        'if(' + N + '(e===s.doc.activeElement&&(e.type||e.href))){' + source + '}';
                      break;
                    case 'focus-within':
                      source = 'hasFocus' in doc ?
                        'n=s.doc.activeElement;while(e){if(e===n||e.parentNode===n)break;}' +
                        'if(' + N + '(e===n&&s.doc.hasFocus()&&(e.type||e.href||typeof e.tabIndex=="number"))){' + source + '}' : source;
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** user interface and form pseudo-classes
                // :enabled, :disabled, :read-only, :read-write, :placeholder-shown, :default
                else if ((match = selector.match(Patterns.inputstate))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'enabled':
                      source = 'if(' + N + '(("form" in e||/^optgroup$/i.test(e.nodeName))&&"disabled" in e &&e.disabled===false' +
                        ')){' + source + '}';
                      break;
                    case 'disabled':
                      // https://www.w3.org/TR/html5/forms.html#enabling-and-disabling-form-controls:-the-disabled-attribute
                      source = 'if(' + N + '(("form" in e||/^optgroup$/i.test(e.nodeName))&&"disabled" in e&&' +
                        '(e.disabled===true||(n=s.ancestor("fieldset",e))&&(n=s.first("legend",n))&&!n.contains(e))' +
                        ')){' + source + '}';
                      break;
                    case 'read-only':
                      source =
                        'if(' + N + '(' +
                          '(/^textarea$/i.test(e.nodeName)&&(e.readOnly||e.disabled))||' +
                          '("|password|text|".includes("|"+e.type+"|")&&e.readOnly)' +
                        ')){' + source + '}';
                      break;
                    case 'read-write':
                      source =
                        'if(' + N + '(' +
                          '((/^textarea$/i.test(e.nodeName)&&!e.readOnly&&!e.disabled)||' +
                          '("|password|text|".includes("|"+e.type+"|")&&!e.readOnly&&!e.disabled))||' +
                          '(e.hasAttribute("contenteditable")||(s.doc.designMode=="on"))' +
                        ')){' + source + '}';
                      break;
                    case 'placeholder-shown':
                      source =
                        'if(' + N + '(' +
                          '(/^input|textarea$/i.test(e.nodeName))&&e.hasAttribute("placeholder")&&' +
                          '("|textarea|password|number|search|email|text|tel|url|".includes("|"+e.type+"|"))&&' +
                          '(!s.match(":focus",e))' +
                        ')){' + source + '}';
                      break;
                    case 'default':
                      source =
                        'if(' + N + '("form" in e && e.form)){' +
                          'var x=0;n=[];' +
                          'if(e.type=="image")n=e.form.getElementsByTagName("input");' +
                          'if(e.type=="submit")n=e.form.elements;' +
                          'while(n[x]&&e!==n[x]){' +
                            'if(n[x].type=="image")break;' +
                            'if(n[x].type=="submit")break;' +
                            'x++;' +
                          '}' +
                        '}' +
                        'if(' + N + '(e.form&&(e===n[x]&&"|image|submit|".includes("|"+e.type+"|"))||' +
                          '((/^option$/i.test(e.nodeName))&&e.defaultSelected)||' +
                          '(("|radio|checkbox|".includes("|"+e.type+"|"))&&e.defaultChecked)' +
                        ')){' + source + '}';
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // *** input pseudo-classes (for form validation)
                // :checked, :indeterminate, :valid, :invalid, :in-range, :out-of-range, :required, :optional
                else if ((match = selector.match(Patterns.inputvalue))) {
                  match[1] = match[1].toLowerCase();
                  switch (match[1]) {
                    case 'checked':
                      source = 'if(' + N + '(/^input$/i.test(e.nodeName)&&' +
                        '("|radio|checkbox|".includes("|"+e.type+"|")&&e.checked)||' +
                        '(/^option$/i.test(e.nodeName)&&(e.selected||e.checked))' +
                        ')){' + source + '}';
                      break;
                    case 'indeterminate':
                      source =
                        'if(' + N + '(/^progress$/i.test(e.nodeName)&&!e.hasAttribute("value"))||' +
                          '(/^input$/i.test(e.nodeName)&&("checkbox"==e.type&&e.indeterminate)||' +
                          '("radio"==e.type&&e.name&&!s.first("input[name="+e.name+"]:checked",e.form))' +
                        ')){' + source + '}';
                      break;
                    case 'required':
                      source =
                        'if(' + N +
                          '(/^input|select|textarea$/i.test(e.nodeName)&&e.required)' +
                        '){' + source + '}';
                      break;
                    case 'optional':
                      source =
                        'if(' + N +
                          '(/^input|select|textarea$/i.test(e.nodeName)&&!e.required)' +
                        '){' + source + '}';
                      break;
                    case 'invalid':
                      source =
                        'if(' + N + '((' +
                          '(/^form$/i.test(e.nodeName)&&!e.noValidate)||' +
                          '(e.willValidate&&!e.formNoValidate))&&!e.checkValidity())||' +
                          '(/^fieldset$/i.test(e.nodeName)&&s.first(":invalid",e))' +
                        '){' + source + '}';
                      break;
                    case 'valid':
                      source =
                        'if(' + N + '((' +
                          '(/^form$/i.test(e.nodeName)&&!e.noValidate)||' +
                          '(e.willValidate&&!e.formNoValidate))&&e.checkValidity())||' +
                          '(/^fieldset$/i.test(e.nodeName)&&s.first(":valid",e))' +
                        '){' + source + '}';
                      break;
                    case 'in-range':
                      source =
                        'if(' + N +
                          '(/^input$/i.test(e.nodeName))&&' +
                          '(e.willValidate&&!e.formNoValidate)&&' +
                          '(!e.validity.rangeUnderflow&&!e.validity.rangeOverflow)&&' +
                          '("|date|datetime-local|month|number|range|time|week|".includes("|"+e.type+"|"))&&' +
                          '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
                        '){' + source + '}';
                      break;
                    case 'out-of-range':
                      source =
                        'if(' + N +
                          '(/^input$/i.test(e.nodeName))&&' +
                          '(e.willValidate&&!e.formNoValidate)&&' +
                          '(e.validity.rangeUnderflow||e.validity.rangeOverflow)&&' +
                          '("|date|datetime-local|month|number|range|time|week|".includes("|"+e.type+"|"))&&' +
                          '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
                        '){' + source + '}';
                      break;
                    default:
                      emit('\'' + selector_string + '\'' + qsInvalid);
                      break;
                  }
                }

                // allow pseudo-elements starting with single colon (:)
                // :after, :before, :first-letter, :first-line
                else if ((match = selector.match(Patterns.pseudo_sng))) {
                  source = 'if(' + D + '(e.nodeType==1)){' + source + '}';
                }

                // allow pseudo-elements starting with double colon (::)
                // ::after, ::before, ::marker, ::placeholder, ::inactive-selection, ::selection, ::-webkit-<foo-bar>
                else if ((match = selector.match(Patterns.pseudo_dbl))) {
                  source = 'if(' + D + '(e.nodeType==1)){' + source + '}';
                }

                else {

                  // reset
                  expr = false;
                  status = false;

                  // process registered selector extensions
                  for (expr in Selectors) {
                    if ((match = selector.match(Selectors[expr].Expression))) {
                      result = Selectors[expr].Callback(match, source, mode, callback);
                      if ('match' in result) { match = result.match; }
                      vars = result.modvar;
                      if (mode) {
                         // add extra select() vars
                         vars && S_VARS.indexOf(vars) < 0 && (S_VARS[S_VARS.length] = vars);
                      } else {
                         // add extra match() vars
                         vars && M_VARS.indexOf(vars) < 0 && (M_VARS[M_VARS.length] = vars);
                      }
                      // extension source code
                      source = result.source;
                      // extension status code
                      status = result.status;
                      // break on status error
                      if (status) { break; }
                    }
                  }

                  if (!status) {
                    emit('unknown pseudo-class selector \'' + selector + '\'');
                    return '';
                  }

                  if (!expr) {
                    emit('unknown token in selector \'' + selector + '\'');
                    return '';
                  }

                }
                break;

            default:
              emit('\'' + selector_string + '\'' + qsInvalid);
              break;

            }
            // end of switch symbol

            if (!match) {
              emit('\'' + selector_string + '\'' + qsInvalid);
              return '';
            }

            // pop last component
            selector = match.pop();
          }
          // end of while selector

          return source;
        },

      // replace ':scope' pseudo-class with element references
      makeref =
        function(selectors, element) {
          return selectors.replace(/:scope/ig,
            element.nodeName.toLowerCase() +
            (element.id ? '#' + element.id : '') +
            (element.className ? '.' + element.classList[0] : ''));
        },

      // equivalent of w3c 'closest' method
      ancestor =
        function _closest(selectors, element, callback) {

          if ((/:scope/i).test(selectors)) {
            selectors = makeref(selectors, element);
          }

          while (element) {
            if (match(selectors, element, callback)) break;
            element = element.parentElement;
          }
          return element;
        },

      match_assert =
        function(f, element, callback) {
          for (var i = 0, l = f.length, r = false; l > i; ++i)
            f[i](element, callback, null, false) && (r = true);
          return r;
        },

      match_collect =
        function(selectors, callback) {
          for (var i = 0, l = selectors.length, f = [ ]; l > i; ++i)
            f[i] = compile(selectors[i], false, callback);
          return { factory: f };
        },

      // equivalent of w3c 'matches' method
      match =
        function _matches(selectors, element, callback) {

          var expressions, parsed;

          if (element && matchResolvers[selectors]) {
            return match_assert(matchResolvers[selectors].factory, element, callback);
          }

          lastMatched = selectors;

          // arguments validation
          if (arguments.length === 0) {
            emit(qsNotArgs, TypeError);
            return Config.VERBOSITY ? undefined : false;
          } else if (arguments[0] === '') {
            emit('\'\'' + qsInvalid);
            return Config.VERBOSITY ? undefined : false;
          }

          // input NULL or UNDEFINED
          if (typeof selectors != 'string') {
            selectors = '' + selectors;
          }

          if ((/:scope/i).test(selectors)) {
            selectors = makeref(selectors, element);
          }

          // normalize input string
          parsed = selectors.
            replace(/\x00|\\$/g, '\ufffd').
            replace(REX.CombineWSP, '\x20').
            replace(REX.PseudosWSP, '$1').
            replace(REX.TabCharWSP, '\t').
            replace(REX.CommaGroup, ',').
            replace(REX.TrimSpaces, '');

          // parse, validate and split possible compound selectors
          if ((expressions = parsed.match(reValidator)) && expressions.join('') == parsed) {
            expressions = parsed.match(REX.SplitGroup);
            if (parsed[parsed.length - 1] == ',') {
              emit(qsInvalid);
              return Config.VERBOSITY ? undefined : false;
            }
          } else {
            emit('\'' + selectors + '\'' + qsInvalid);
            return Config.VERBOSITY ? undefined : false;
          }

          matchResolvers[selectors] = match_collect(expressions, callback);

          return match_assert(matchResolvers[selectors].factory, element, callback);
        },

      // equivalent of w3c 'querySelector' method
      first =
        function _querySelector(selectors, context, callback) {
          if (arguments.length === 0) {
            emit(qsNotArgs, TypeError);
          }
          return select(selectors, context,
            typeof callback == 'function' ?
            function firstMatch(element) {
              callback(element);
              return false;
            } :
            function firstMatch() {
              return false;
            }
          )[0] || null;
        },

      // equivalent of w3c 'querySelectorAll' method
      select =
        function _querySelectorAll(selectors, context, callback) {

          var expressions, nodes, parsed, resolver;

          context || (context = doc);

          if (selectors) {
            if ((resolver = selectResolvers[selectors])) {
              if (resolver.context === context && resolver.callback === callback) {
                var f = resolver.factory, h = resolver.htmlset, n = resolver.nodeset, nodes = [ ];
                if (n.length > 1) {
                  for (var i = 0, l = n.length, list; l > i; ++i) {
                    list = compat[n[i][0]](context, n[i].slice(1))();
                    if (f[i] !== null) {
                      f[i](list, callback, context, nodes);
                    } else {
                      nodes = nodes.concat(list);
                    }
                  }
                  if (l > 1 && nodes.length > 1) {
                    nodes.sort(documentOrder);
                    hasDupes && (nodes = unique(nodes));
                  }
                } else {
                  if (f[0]) {
                    nodes = f[0](h[0](), callback, context, nodes);
                  } else {
                    nodes = h[0]();
                  }
                }
                return typeof callback == 'function' ?
                  concatCall(nodes, callback) : nodes;
              }
            }
          }

          lastSelected = selectors;

          // arguments validation
          if (arguments.length === 0) {
            emit(qsNotArgs, TypeError);
            return Config.VERBOSITY ? undefined : none;
          } else if (arguments[0] === '') {
            emit('\'\'' + qsInvalid);
            return Config.VERBOSITY ? undefined : none;
          } else if (lastContext !== context) {
            lastContext = switchContext(context);
          }

          // input NULL or UNDEFINED
          if (typeof selectors != 'string') {
            selectors = '' + selectors;
          }

          if ((/:scope/i).test(selectors)) {
            selectors = makeref(selectors, context);
          }

          // normalize input string
          parsed = selectors.
            replace(/\x00|\\$/g, '\ufffd').
            replace(REX.CombineWSP, '\x20').
            replace(REX.PseudosWSP, '$1').
            replace(REX.TabCharWSP, '\t').
            replace(REX.CommaGroup, ',').
            replace(REX.TrimSpaces, '');

          // parse, validate and split possible compound selectors
          if ((expressions = parsed.match(reValidator)) && expressions.join('') == parsed) {
            expressions = parsed.match(REX.SplitGroup);
            if (parsed[parsed.length - 1] == ',') {
              emit(qsInvalid);
              return Config.VERBOSITY ? undefined : false;
            }
          } else {
            emit('\'' + selectors + '\'' + qsInvalid);
            return Config.VERBOSITY ? undefined : false;
          }

          // save/reuse factory and closure collection
          selectResolvers[selectors] = collect(expressions, context, callback);

          if(context._extraNodes) return selectResolvers[selectors].extraNodes;

          nodes = selectResolvers[selectors].results;

          return typeof callback == 'function' ?
            concatCall(nodes, callback) : nodes;
        },

      // optimize selectors avoiding duplicated checks
      optimize =
        function(selector, token) {
          var index = token.index,
          length = token[1].length + token[2].length;
          return selector.slice(0, index) +
            (' >+~'.indexOf(selector.charAt(index - 1)) > -1 ?
              (':['.indexOf(selector.charAt(index + length + 1)) > -1 ?
              '*' : '') : '') + selector.slice(index + length - (token[1] == '*' ? 1 : 0));
        },

      // prepare factory resolvers and closure collections
      collect =
        function(selectors, context, callback) {

          var i, l, seen = { }, token = ['', '*', '*'], optimized = selectors,
          factory = [ ], htmlset = [ ], nodeset = [ ], results = [ ], type;

          for (i = 0, l = selectors.length; l > i; ++i) {

            if (!seen[selectors[i]] && (seen[selectors[i]] = true)) {
              type = selectors[i].match(reOptimizer);
              if (type && type[1] != ':' && (token = type)) {
                token[1] || (token[1] = '*');
                optimized[i] = optimize(optimized[i], token);
              } else {
                token = ['', '*', '*'];
              }
    		}

            nodeset[i] = token[1] + token[2];
            htmlset[i] = compat[token[1]](context, token[2]);
            factory[i] = compile(optimized[i], true, null);

            factory[i] ?
              factory[i](htmlset[i](), callback, context, results) :
              result.concat(htmlset[i]());
          }

          var extraNodes = [];
          results = results.map(function(i) {
            if(!i.node) return i;
            extraNodes.push(i);
            return i.node;
          });

          if (l > 1) {
            results.sort(documentOrder);
            hasDupes && (results = unique(results));
          }

          return {
            callback: callback,
            context: context,
            factory: factory,
            htmlset: htmlset,
            nodeset: nodeset,
            results: results,
            extraNodes: extraNodes
          };

        },

      // QSA placeholders to native references
      _closest, _matches, _querySelector, _querySelectorAll,

      // overrides QSA methods (only for browsers)
      install =
        function(all) {

          // save native QSA references
          _closest = Element.prototype.closest;
          _matches = Element.prototype.matches;
          _querySelector = Document.prototype.querySelector;
          _querySelectorAll = Document.prototype.querySelectorAll;

          Element.prototype.closest =
            function closest() {
              var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
              if (!('nodeType' in this)) { emit('\'closest\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
              return arguments.length < 1 ? ancestor.apply(this, [ ]) :
                     arguments.length < 2 ? ancestor.apply(this, [ arguments[0], this ]) :
                                            ancestor.apply(this, [ arguments[0], this, typeof arguments[1] == 'function' ? arguments[1] : undefined ]);
            };

          Element.prototype.matches =
            function matches() {
              var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
              if (!('nodeType' in this)) { emit('\'matches\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
              return arguments.length < 1 ? match.apply(this, [ ]) :
                     arguments.length < 2 ? match.apply(this, [ arguments[0], this ]) :
                                            match.apply(this, [ arguments[0], this, typeof arguments[1] == 'function' ? arguments[1] : undefined ]);
            };

          Element.prototype.querySelector =
          Document.prototype.querySelector =
          DocumentFragment.prototype.querySelector =
            function querySelector() {
              var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
              if (!('nodeType' in this)) { emit('\'querySelector\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
              return arguments.length < 1 ? first.apply(this, [ ]) :
                     arguments.length < 2 ? first.apply(this, [ arguments[0], this ]) :
                                            first.apply(this, [ arguments[0], this, typeof arguments[1] == 'function' ? arguments[1] : undefined ]);
            };

          Element.prototype.querySelectorAll =
          Document.prototype.querySelectorAll =
          DocumentFragment.prototype.querySelectorAll =
            function querySelectorAll() {
              var ctor = Object.getPrototypeOf(this).__proto__.__proto__.constructor.name;
              if (!('nodeType' in this)) { emit('\'querySelectorAll\' called on an object that does not implement interface ' + ctor + '.', TypeError); }
              return arguments.length < 1 ? select.apply(this, [ ]) :
                     arguments.length < 2 ? select.apply(this, [ arguments[0], this ]) :
                                            select.apply(this, [ arguments[0], this, typeof arguments[1] == 'function' ? arguments[1] : undefined ]);
            };

          if (all) {
            document.addEventListener('load', function(e) {
              var c, d, r, s, t = e.target;
              if (/iframe/i.test(t.nodeName)) {
                c = '(' + Export + ')(this, ' + Factory + ');'; d = t.contentDocument;
                s = d.createElement('script'); s.textContent = c + 'NW.Dom.install()';
                r = d.documentElement; r.removeChild(r.insertBefore(s, r.firstChild));
              }
            }, true);
          }

        },

      // restore QSA methods (only for browsers)
      uninstall =
        function() {
          // reinstates QSA native references
          Element.prototype.closest = _closest;
          Element.prototype.matches = _matches;
          Element.prototype.querySelector =
          Document.prototype.querySelector =
          DocumentFragment.prototype.querySelector = _querySelector;
          Element.prototype.querySelectorAll =
          Document.prototype.querySelectorAll =
          DocumentFragment.prototype.querySelectorAll = _querySelectorAll;
        },

      // empty set
      none = Array(),

      // context
      lastContext,

      // selector
      lastMatched,
      lastSelected,

      // cached lambdas
      matchLambdas = { },
      selectLambdas = { },

      // cached resolvers
      matchResolvers = { },
      selectResolvers = { },

      // passed to resolvers
      Snapshot = {

        doc: doc,
        from: doc,
        root: root,

        byTag: byTag,

        first: first,
        match: match,

        ancestor: ancestor,

        nthOfType: nthOfType,
        nthElement: nthElement,

        hasAttributeNS: hasAttributeNS
      },

      // public exported methods/objects
      Dom = {

        // exported cache objects

        lastMatched: lastMatched,
        lastSelected: lastSelected,

        matchLambdas: matchLambdas,
        selectLambdas: selectLambdas,

        matchResolvers: matchResolvers,
        selectResolvers: selectResolvers,

        // exported compiler macros

        CFG: CFG,

        M_BODY: M_BODY,
        S_BODY: S_BODY,
        M_TEST: M_TEST,
        S_TEST: S_TEST,

        // exported engine methods

        byId: byId,
        byTag: byTag,
        byClass: byClass,

        match: match,
        first: first,
        select: select,
        closest: ancestor,

        compile: compile,
        configure: configure,

        emit: emit,
        Config: Config,
        Snapshot: Snapshot,

        Version: version,

        install: install,
        uninstall: uninstall,

        Operators: Operators,
        Selectors: Selectors,

        // register a new selector combinator symbol and its related function resolver
        registerCombinator:
          function(combinator, resolver) {
            var i = 0, l = combinator.length, symbol;
            for (; l > i; ++i) {
              if (combinator[i] != '=') {
                symbol = combinator[i];
                break;
              }
            }
            if (CFG.combinators.indexOf(symbol) < 0) {
              CFG.combinators = CFG.combinators.replace('](', symbol + '](');
              CFG.combinators = CFG.combinators.replace('])', symbol + '])');
              Combinators[combinator] = resolver;
              setIdentifierSyntax();
            } else {
              console.warn('Warning: the \'' + combinator + '\' combinator is already registered.');
            }
          },

        // register a new attribute operator symbol and its related function resolver
        registerOperator:
          function(operator, resolver) {
            var i = 0, l = operator.length, symbol;
            for (; l > i; ++i) {
              if (operator[i] != '=') {
                symbol = operator[i];
                break;
              }
            }
            if (CFG.operators.indexOf(symbol) < 0 && !Operators[operator]) {
              CFG.operators = CFG.operators.replace(']=', symbol + ']=');
              Operators[operator] = resolver;
              setIdentifierSyntax();
            } else {
              console.warn('Warning: the \'' + operator + '\' operator is already registered.');
            }
          },

        // register a new selector symbol and its related function resolver
        registerSelector:
          function(name, rexp, func) {
            Selectors[name] || (Selectors[name] = {
              Expression: rexp,
              Callback: func
            });
          }

      };

      initialize(doc);

      return Dom;

    });
    });

    function processCSS() {
        let styleNodes = this.styleNodes;
        if(!styleNodes.length) return;
        const genId$1 = () => this.config.cssGenId ? this.config.cssGenId() : genId();

        let self = this.css = {id: genId$1(), externalMainName: null};
        let astList = [];
        let selectors = {};
        let removeBlocks = [];

        const selector2str = (sel) => {
            if(!sel.children) sel = {type: 'Selector', children: sel};
            return csstree.generate(sel);
        };

        const convertAst = (node, parent) => {
            if(!node) return node;
            if(typeof node != 'object') return node;
            if(Array.isArray(node)) return node.map(i => convertAst(i, parent));
            if(node.toArray) return node.toArray().map(i => convertAst(i, parent));
            let r = {parent};
            let newParent = node.type ? r : parent;
            for(let k in node) r[k] = convertAst(node[k], newParent);
            return r;
        };

        const parseCSS = (content, option) => {
            let ast = csstree.parse(content, option);
            return convertAst(ast, null);
        };

        const last = a => a[a.length - 1];

        const isKeyframes = (name) => name == 'keyframes' || name == '-webkit-keyframes' || name == '-moz-keyframes' || name == '-o-keyframes';

        styleNodes.forEach(transform);

        function transform(styleNode) {
            let external = false;
            let globalBlock = false;
            styleNode.attributes.forEach(a => {
                if(a.name == 'external') self.hasExternal = external = true;
                else if(a.name == 'main') self.externalMainName = a.value;
                else if(a.name == 'global') globalBlock = true;
            });

            let ast = parseCSS(styleNode.content);
            astList.push(ast);

            csstree.walk(ast, function(node) {
                if(node.type == 'Declaration') {
                    if(node.property == 'animation' || node.property == 'animation-name') {
                        let c = node.value.children[0];
                        if(!c) return;
                        if(c.type == 'Identifier') {
                            c.name += '-' + self.id;
                        } else {
                            c = last(node.value.children);
                            if(c.type == 'Identifier') c.name += '-' + self.id;
                        }
                    }
                } else if(node.type === 'Atrule') {
                    if(isKeyframes(node.name)) {
                        node.prelude.children[0].name += '-' + self.id;
                    }
                } else if(node.type === 'Rule') {
                    if(node.parent.parent && node.parent.parent.type == 'Atrule') {
                        if(isKeyframes(node.parent.parent.name)) return;
                    }

                    assert(node.prelude.type=='SelectorList');

                    let emptyBlock = node.block.children.length == 0;
                    if(emptyBlock) removeBlocks.push(node);

                    let selectorList = node.prelude.children;
                    for(let i=0; i < selectorList.length; i++) {
                        processSelector(selectorList[i]);
                    }

                    function processSelector(fullSelector) {
                        assert(fullSelector.type == 'Selector');
                        let origin = [];
                        fullSelector.children.forEach(sel => {
                            if(sel.type == 'PseudoClassSelector' && sel.name == 'global') {
                                sel = sel.children[0];
                                assert(sel.type == 'Raw');
                                let a = parseCSS(sel.value, {context: 'selector'});
                                assert(a.type == 'Selector');
                                a.children.forEach(sel => {
                                    sel.global = true;
                                    origin.push(sel);
                                });
                            } else {
                                origin.push(sel);
                            }
                        });

                        assert(origin.length);

                        let cleanSelectorItems = [];
                        for(let i=0; i<origin.length; i++) {
                            let s = origin[i];
                            if(s.global) continue;
                            if(s.type == 'PseudoClassSelector' || s.type == 'PseudoElementSelector') {
                                let prev = origin[i - 1];
                                if(!prev || prev.type == 'Combinator' || prev.type == 'WhiteSpace') {
                                    cleanSelectorItems.push({type: 'TypeSelector', name: '*'});
                                }
                            } else cleanSelectorItems.push(s);
                        }
                        while(cleanSelectorItems.length && last(cleanSelectorItems).type == 'WhiteSpace') cleanSelectorItems.pop();
                        if(!cleanSelectorItems.length || globalBlock) {  // fully global?
                            assert(origin.length);
                            fullSelector.children = origin;
                            return;
                        }
                        let cleanSelector = selector2str(cleanSelectorItems);

                        let sobj = selectors[cleanSelector];
                        if(!sobj) {
                            let isSimple = false;
                            if(cleanSelectorItems[0].type == 'ClassSelector') {
                                isSimple = true;
                                for(let i=1; i<cleanSelectorItems.length; i++) {
                                    if(cleanSelectorItems[i].type != 'AttributeSelector') {
                                        isSimple = false;
                                        break;
                                    }
                                }
                            }
        
                            selectors[cleanSelector] = sobj = {
                                cleanSelector,
                                isSimple,
                                source: [],
                                fullyGlobal: origin.every(i => i.global)
                            };
                        }

                        if(external) {
                            assert(sobj.isSimple);
                            if(!sobj.external) sobj.external = emptyBlock ? true : genId$1();
                        } else if(!sobj.local) {
                            if(sobj.isSimple) sobj.local = genId$1();
                            else sobj.local = self.id;
                        }

                        let hash = external ? sobj.external : sobj.local;
                        if(emptyBlock) fullSelector.emptyBlock = true;
                        sobj.source.push(fullSelector);

                        let hashed = origin.slice();
                        const insert = (i) => {
                            hashed.splice(i, 0, {type: "ClassSelector", loc: null, name: hash, __hash: true});
                        };

                        for(let i=hashed.length-1;i>=0;i--) {
                            let sel = hashed[i];
                            let left = hashed[i - 1];
                            let right = hashed[i + 1];
                            if(sel.global) continue;
                            if(sel.type == 'PseudoClassSelector' || sel.type == 'PseudoElementSelector') {
                                if(!left || left.type == 'Combinator' || left.type == 'WhiteSpace') insert(i);
                                continue;
                            } else if(sel.type == 'Combinator' || sel.type == 'WhiteSpace') continue;
                            if(!right || ['PseudoClassSelector', 'PseudoElementSelector', 'Combinator', 'WhiteSpace'].includes(right.type)) insert(i + 1);
                        }

                        fullSelector.children = hashed;
                    }            }
            });
        }

        self.isExternalClass = (name) => {
            let sobj = selectors['.' + name];
            return sobj && sobj.external;
        };

        self.getClassMap = () => {
            let classMap = {};
            let metaClass = {};
            Object.values(selectors).forEach(sel => {
                if(!sel.isSimple) return;

                let className = sel.source[0].children[0].name;
                if(sel.external) {
                    metaClass[className] = sel.external;
                }
                if(sel.local) {
                    classMap[className] = sel.local;
                }
            });
            return {classMap, metaClass, main: self.externalMainName};
        };

        self.process = function(data) {
            let dom = makeDom(data);
            const nw = nwsapi({
                document: dom,
                DOMException: function() {}
            });

            Object.values(selectors).forEach(sel => {
                if(sel.fullyGlobal || !sel.local) return;
                let selected;
                try {
                    selected = nw.select([sel.cleanSelector]);
                } catch (_) {
                    let e = new Error(`CSS error: '${selector2str(sel.source[0])}'`);
                    e.details = `selector: '${selector2str(sel.source[0])}'`;
                    throw e;
                }
                selected.forEach(s => {
                    s.node.__node.classes.add(sel.local);
                    s.lvl.forEach(l => l.__node.classes.add(sel.local));
                });
            });
        };

        self.getContent = function() {
            removeBlocks.forEach(node => {
                let i = node.parent.children.indexOf(node);
                if(i>=0) node.parent.children.splice(i, 1);
            });
            return astList.map(ast => csstree.generate(ast)).join('');
        };
    }


    function makeDom(data) {

        function build(parent, list) {
            list.forEach(e => {
                if(e.type == 'each' || e.type == 'fragment' || e.type == 'slot') {
                    if(e.body && e.body.length) build(parent, e.body);
                    return;
                } else if(e.type == 'if') {
                    if(e.bodyMain && e.bodyMain.length) build(parent, e.bodyMain);
                    if(e.body && e.body.length) build(parent, e.body);
                    return;
                } else if(e.type == 'await') {
                    if(e.parts.main && e.parts.main.length) build(parent, e.parts.main);
                    if(e.parts.then && e.parts.then.length) build(parent, e.parts.then);
                    if(e.parts.catch && e.parts.catch.length) build(parent, e.parts.catch);
                    return;
                } else if(e.type != 'node') return;
                //if(e.name[0].match(/[A-Z]/)) return;
                let n = new Node(e.name, {__node: e});
                e.attributes.forEach(a => {
                    if(a.name == 'class') n.className += ' ' + a.value;
                    else if(a.name == 'id') n.id = a.value;
                    else if(a.name.startsWith('class:')) {
                        n.className += ' ' + a.name.substring(6);
                    } else n.attributes[a.name] = a.value;
                });
                n.className = n.className.trim();
                parent.appendChild(n);
                if(e.body && e.body.length) build(n, e.body);
            });
        }
        let body = new Node('body', {
            nodeType: 9,
            contentType: 'text/html',
            compatMode: '',
            _extraNodes: true
        });
        body.documentElement = body;
        build(body, data.body);

        return body;
    }
    function Node(name, data, children) {
        this.nodeName = name;
        this.childNodes = [];
        this.className = '';
        this.attributes = {};

        this.parentElement = null;
        this.firstElementChild = null;
        this.lastElementChild = null;
        this.nextElementSibling = null;
        this.previousElementSibling = null;

        if(data) Object.assign(this, data);
        if(children) children.forEach(c => this.appendChild(c));
    }
    Node.prototype.getAttribute = function(n) {
        if(n == 'class') return this.className;
        if(n == 'id') return this.id;
        return this.attributes[n];
    };

    Node.prototype.appendChild = function(n) {
        n.parentElement = this;
        this.childNodes.push(n);
        if(!this.firstElementChild) this.firstElementChild = n;
        if(this.lastElementChild) {
            this.lastElementChild.nextElementSibling = n;
            n.previousElementSibling = this.lastElementChild;
            this.lastElementChild = n;
        } else this.lastElementChild = n;
    };

    Node.prototype.getElementsByTagNameNS = function(ns, name) {
        return this.getElementsByTagName(name);
    };

    Node.prototype.getElementsByTagName = function(name) {
        let result = [];
        this.childNodes.forEach(n => {
            if(name == '*' || n.nodeName == name) result.push(n);
            result.push.apply(result, n.getElementsByTagName(name));
        });
        return result;
    };

    Node.prototype.getElementsByClassName = function(names) {
        names = names.split(/\s+/);
        if(names.length != 1) throw 'Not supported';
        let cls = names[0];

        let result = [];
        this.childNodes.forEach(n => {
            let rx = RegExp('(^|\\s)' + cls + '(\\s|$)', 'i');
            if(rx.test(n.className)) result.push(n);
            result.push.apply(result, n.getElementsByClassName(cls));
        });
        return result;
    };

    function shaking() {
        let src = this.runtime.header + this.runtime.body + (this.script.source || '');

        const remove = (name) => {
            let root = this.script.rootLevel;
            for(let i=root.length - 1; i >= 0; i--) {
                if(root[i]._name == name) {
                    root.splice(i, 1);
                }
            }
        };

        if(src.indexOf('$attributes') < 0) {
            remove('$attributes');
            if(src.indexOf('$props') < 0) {
                remove('$props');
            }
        }

        if(src.indexOf('$emit') < 0) {
            remove('$emit');
        }

        if(src.indexOf('$context') < 0) {
            remove('$context');
        }
    }

    function makeComponent(node, makeEl) {
        let propList = node.attributes;
        let binds = [];
        let head = [];
        let forwardAllEvents = false;
        let options = ['$$: $component'];
        let dynamicComponent;

        let propLevel = 0, propLevelType;

        if(node.name == 'component') {
            assert(node.elArg);
            dynamicComponent = node.elArg[0] == '{' ? unwrapExp(node.elArg) : node.elArg;
        }

        let passOption = {};

        if(node.body && node.body.length) {
            let slots = {};
            let defaultSlot = {
                name: 'default',
                type: 'slot'
            };
            defaultSlot.body = node.body.filter(n => {
                if(n.type != 'slot') return true;
                let rx = n.value.match(/^\#slot:(\S+)/);
                if(rx) n.name = rx[1];
                else n.name = 'default';
                assert(!slots[n], 'double slot');
                slots[n.name] = n;
            });

            if(!slots.default) slots.default = defaultSlot;
            // TODO: (else) check if defaultSlot is empty

            Object.values(slots).forEach(slot => {
                assert(isSimpleName(slot.name));
                let args = '', setters = '';
                let rx = slot.value && slot.value.match(/^#slot\S*\s+(.*)$/);
                if(rx) {
                    let props = rx[1].trim().split(/\s*,\s*/);
                    props.forEach(n => {
                        assert(isSimpleName(n), 'Wrong prop for slot');
                    });
                    args = `let ${props.join(', ')};`;
                    setters = ',' + props.map(name => {
                        return `set_${name}: (_${name}) => {${name} = _${name}; $$apply();}`;
                    }).join(',\n');
                }

                passOption.slots = true;
                let block = this.buildBlock(slot);
                const convert = block.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
                head.push(`
                slots.${slot.name} = function($label, $component) {
                    let $childCD = $cd.new();
                    let $tpl = ${convert}(\`${this.Q(block.tpl)}\`);

                    ${args}

                    ${block.source};
                    ${block.name}($childCD, $tpl);
                    $label.parentNode.insertBefore($tpl, $label.nextSibling);

                    return {
                        destroy: () => {
                            $childCD.destroy();
                        }
                        ${setters}
                    }
                }
            `);
            });
        }

        let boundEvents = {};
        propList = propList.filter(prop => {
            let name = prop.name;
            let value = prop.value;
            if(name == '@@') {
                forwardAllEvents = true;
                return false;
            } else if(name[0] == ':' || name.startsWith('bind:')) {
                let inner, outer;
                if(name[0] == ':') inner = name.substring(1);
                else inner = name.substring(5);
                if(value) outer = unwrapExp(value);
                else outer = inner;
                assert(isSimpleName(inner), `Wrong property: '${inner}'`);
                assert(detectExpressionType(outer) == 'identifier', 'Wrong bind name: ' + outer);

                let watchName = '$$w' + (this.uniqIndex++);
                propLevelType = 'binding';
                passOption.props = true;
                passOption.push = true;
                head.push(`
                const ${watchName} = $watch($cd, () => (${outer}), _${inner} => {
                    props.${inner} = _${inner};
                    ${watchName}.pair && ${watchName}.pair(${watchName}.value);
                    $$push();
                }, {ro: true, cmp: $runtime.$$compareDeep});
                $runtime.fire(${watchName});
            `);
                binds.push(`
                $runtime.bindPropToComponent($child, '${inner}', ${watchName}, _${outer} => {
                    ${outer} = _${outer};
                    $$apply();
                });
            `);
                return false;
            } else if(name == 'this') {
                dynamicComponent = unwrapExp(value);
                return false;
            }
            return true;
        });

        propList.forEach(prop => {
            let name = prop.name;
            let value = prop.value;
            if(name[0] == '#') {
                assert(!value, 'Wrong ref');
                let name = name.substring(1);
                assert(isSimpleName(name), name);
                this.checkRootName(name);
                binds.push(`${name} = $child;`);
                return;
            } else if(name[0] == '{') {
                value = name;
                name = unwrapExp(name);
                if(name.startsWith('...')) {
                    if(propLevelType) propLevel++;
                    propLevelType = 'spreading';

                    name = name.substring(3);
                    assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
                    passOption.push = true;
                    let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';
                    head.push(`
                    $runtime.fire($watch($cd, () => (${name}), (value) => {
                        $runtime.spreadObject(${propObject}, value);
                        $$push();
                    }, {ro: true, cmp: $runtime.$$deepComparator(0)}));
                `);
                    return;
                }            assert(detectExpressionType(name) == 'identifier', 'Wrong prop');
            } else if(name[0] == '@' || name.startsWith('on:')) {
                if(name[0] == '@') name = name.substring(1);
                else name = name.substring(3);
                let arg = name.split(/[\|:]/);
                let exp, handler, isFunc, event = arg.shift();
                assert(event);

                if(value) exp = unwrapExp(value);
                else {
                    if(!arg.length) {
                        // forwarding
                        passOption.events = true;
                        if(forwardAllEvents || boundEvents[event]) head.push(`$runtime.$$addEventForComponent(events, '${event}', $option.events.${event});`);
                        else head.push(`events.${event} = $option.events.${event};`);
                        boundEvents[event] = true;
                        return;
                    }
                    handler = arg.pop();
                }
                assert(arg.length == 0);
                assert(!handler ^ !exp);

                if(exp) {
                    let type = detectExpressionType(exp);
                    if(type == 'identifier') {
                        handler = exp;
                        exp = null;
                    } else isFunc = type == 'function';
                }

                let callback;
                if(isFunc) {
                    callback = exp;
                } else if(handler) {
                    this.checkRootName(handler);
                    callback = handler;
                } else {
                    callback = `($event) => {${this.Q(exp)}}`;
                }

                passOption.events = true;
                if(forwardAllEvents || boundEvents[event]) head.push(`$runtime.$$addEventForComponent(events, '${event}', ${callback});`);
                else head.push(`events.${event} = ${callback};`);
                boundEvents[event] = true;
                return;
            } else if(name == 'class' || name.startsWith('class:')) {
                let metaClass, args = name.split(':');
                if(args.length == 1) {
                    metaClass = '$$main';
                } else {
                    assert(args.length == 2);
                    metaClass = args[1];
                    assert(metaClass);
                }
                assert(value);

                const parsed = this.parseText(prop.value);
                let exp = parsed.result;
                let funcName = `$$pf${this.uniqIndex++}`;
                head.push(`
                const ${funcName} = () => $$resolveClass(${exp});
                $class['${metaClass}'] = ${funcName}();

                $watch($cd, ${funcName}, (result) => {
                    $class['${metaClass}'] = result;
                    $$push();
                }, {ro: true, value: $class['${metaClass}']});
            `);
                passOption.class = true;
                passOption.push = true;
                this.use.resolveClass = true;
                return;
            }
            assert(isSimpleName(name), `Wrong property: '${name}'`);
            if(value && value.indexOf('{') >= 0) {
                let exp = this.parseText(value).result;

                if(propLevelType == 'spreading') propLevel++;
                propLevelType = 'prop';
                let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';

                passOption.props = true;
                passOption.push = true;
                head.push(`
                $runtime.fire($watch($cd, () => (${exp}), _${name} => {
                    ${propObject}.${name} = _${name};
                    $$push();
                }, {ro: true, cmp: $runtime.$$compareDeep}));
            `);
            } else {
                if(value) value = '`' + this.Q(value) + '`';
                else value = 'true';

                if(propLevelType == 'spreading') propLevel++;
                propLevelType = 'attr';

                let propObject = propLevel ? `$$lvl[${propLevel}]` : 'props';
                head.push(`
                ${propObject}.${name} = ${value};
            `);
            }
        });

        let rootHead = [];
        if(passOption.push) {
            rootHead.push(`let $$push = $runtime.noop;`);
            binds.push(`$$push = $child.push;`);
        }

        if(passOption.class) {
            rootHead.push(`let $class = {}`);
            options.push('$class');
        }

        if(passOption.slots) {
            rootHead.push('let slots = {};');
            options.push('slots');
        }

        if(propLevel || propLevelType) {
            if(propLevel) rootHead.push(`let $$lvl = [], props = $runtime.makeTree(${propLevel}, $$lvl);`);
            else rootHead.push('let props = {};');
            options.push('props');
        }

        if(forwardAllEvents) {
            rootHead.push('let events = Object.assign({}, $option.events);');
            options.push('events');
        } else if(passOption.events) {
            rootHead.push('let events = {};');
            options.push('events');
        }

        const makeSrc = (componentName, brackets) => {
            let scope = false;
            let result = '';
            if(rootHead.length || head.length) {
                scope = true;
                result = `
                ${rootHead.join('\n')};
                ${head.join('\n')};
            `;
            }
            if(binds.length) {
                scope = true;
                result += `
                let $child = $runtime.callComponent($cd, ${componentName}, ${makeEl()}, {${options.join(', ')}});
                if($child) {
                    ${binds.join('\n')};
                }
            `;
            } else {
                result += `
                $runtime.callComponent($cd, ${componentName}, ${makeEl()}, {${options.join(', ')}});
            `;
            }
            if(brackets && scope) return '{' + result + '}';
            return result;
        };

        if(!dynamicComponent) {
            return {bind: `${makeSrc(node.name, true)}`};
        } else {
            let componentName = '$$comp' + (this.uniqIndex++);
            return {bind: `
        {
            const ${componentName} = ($cd, $ComponentConstructor) => {
                ${makeSrc('$ComponentConstructor')}
            };
            let childCD, finalLabel = $runtime.getFinalLabel(${makeEl()});
            $watch($cd, () => (${dynamicComponent}), ($ComponentConstructor) => {
                if(childCD) {
                    childCD.destroy();
                    $runtime.removeElementsBetween(${makeEl()}, finalLabel);
                }
                childCD = null;
                if($ComponentConstructor) {
                    childCD = $cd.new();
                    ${componentName}(childCD, $ComponentConstructor);
                }
            });
        }`};
        }
    }

    function bindProp(prop, makeEl, node) {
        let name, arg;
        if(prop.name[0] == '@') {
            arg = prop.name.substring(1);
            name = 'on';
        }
        if(!name && prop.name[0] == ':') {
            name = 'bind';
            arg = prop.name.substring(1);
        }
        if(!name && prop.name[0] == '*') {
            let rx = prop.name.match(/^\*\{.*\}$/);
            if(rx) {
                assert(prop.value == null, 'wrong binding: ' + prop.content);
                name = 'use';
                prop.value = prop.name.substring(1);
            } else {
                name = 'use';
                arg = prop.name.substring(1);
            }
        }
        if(!name && prop.value == null) {
            let rx = prop.name.match(/^\{(.*)\}$/);
            if(rx) {
                name = rx[1];
                if(name.startsWith('...')) {
                    // spread operator
                    name = name.substring(3);
                    assert(detectExpressionType(name) == 'identifier');
                    return {bind: `
                    ${node.spreadObject}.spread(() => ${name});
                `};
                } else {
                    prop.value = prop.name;
                }
            }
        }
        if(!name) {
            let r = prop.name.match(/^(\w+)\:(.*)$/);
            if(r) {
                name = r[1];
                arg = r[2];
            } else name = prop.name;
        }

        function getExpression() {
            let exp = prop.value.match(/^\{(.*)\}$/)[1];
            assert(exp, prop.content);
            return exp;
        }

        if(name[0] == '#') {
            let target = name.substring(1);
            assert(isSimpleName(target), target);
            this.checkRootName(target);
            return {bind: `${target}=${makeEl()};`};
        } else if(name == 'on') {
            if(arg == '@') {
                assert(!prop.value);
                return {bind: `
                {
                    for(let event in $option.events) {
                        $runtime.addEvent($cd, ${makeEl()}, event, $option.events[event]);
                    }
                }
            `};
            }
            let mod = '', opts = arg.split(/[\|:]/);
            let event = opts.shift();
            let exp, handler, funcName;
            if(prop.value) {
                exp = getExpression();
            } else {
                if(!opts.length) {
                    // forwarding
                    return {bind: `
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => {
                        const fn = $option.events.${event};
                        if(fn) fn($event);
                    });\n`
                    };
                }
                handler = opts.pop();
            }        assert(event, prop.content);
            assert(!handler ^ !exp, prop.content);

            let needPrevent, preventInserted;
            opts.forEach(opt => {
                if(opt == 'preventDefault') {
                    if(preventInserted) return;
                    mod += '$event.preventDefault();';
                    preventInserted = true;
                } else if(opt == 'stopPropagation') {
                    mod += '$event.stopPropagation();';
                } else if(opt == 'enter') {
                    mod += 'if($event.keyCode != 13) return;';
                    needPrevent = true;
                } else if(opt == 'escape') {
                    mod += 'if($event.keyCode != 27) return;';
                    needPrevent = true;
                } else throw 'Wrong modificator: ' + opt;
            });
            if(needPrevent && !preventInserted) mod += '$event.preventDefault();';

            if(exp) {
                let type = detectExpressionType(exp);
                if(type == 'identifier') {
                    handler = exp;
                    exp = null;
                } else if(type == 'function') {
                    funcName = 'fn' + (this.uniqIndex++);
                }        }

            if(funcName) {
                let bind;
                if(exp.indexOf('$element') >= 0) {
                    bind = `{
                    let $element=${makeEl()};
                    const ${funcName} = ${exp};
                    $runtime.addEvent($cd, $element, "${event}", ($event) => { ${mod} ${funcName}($event); $$apply();});
                }`;
                } else {
                    bind = `
                    const ${funcName} = ${exp};
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => { ${mod} ${funcName}($event); $$apply();});
                `;
                }
                return {bind};
            } else if(handler) {
                this.checkRootName(handler);
                return {bind: `
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => { ${mod} ${handler}($event); $$apply();});
                `
                };
            } else {
                let bind;
                if(exp.indexOf('$element') >= 0) {
                    bind = `{
                    let $element=${makeEl()};
                    $runtime.addEvent($cd, $element, "${event}", ($event) => { ${mod} ${this.Q(exp)}; $$apply(); });
                }`;
                } else {
                    bind = `
                    $runtime.addEvent($cd, ${makeEl()}, "${event}", ($event) => { ${mod} ${this.Q(exp)}; $$apply(); });
                `;
                }
                return {bind};
            }
        } else if(name == 'bind') {
            let exp;
            arg = arg.split(/[\:\|]/);
            let attr = arg.shift();
            assert(attr, prop.content);

            if(prop.value) exp = getExpression();
            else {
                if(arg.length) exp = arg.pop();
                else exp = attr;
            }
            let inputType = null;
            if(node.name == 'input') {
                node.attributes.some(a => {
                    if(a.name == 'type') {
                        inputType = a.value;
                        return true;
                    }
                });
            }

            assert(['value', 'checked', 'valueAsNumber', 'valueAsDate', 'selectedIndex'].includes(attr), 'Not supported: ' + prop.content);
            assert(arg.length == 0);
            assert(detectExpressionType(exp) == 'identifier', 'Wrong bind name: ' + prop.content);
            if(attr == 'value' && ['number', 'range'].includes(inputType)) attr = 'valueAsNumber';

            let spreading = '';
            if(node.spreadObject) spreading = `${node.spreadObject}.except(['${attr}']);`;

            let argName = 'a' + (this.uniqIndex++);

            return {bind: `
            ${spreading}
            $runtime.bindInput($cd, ${makeEl()}, '${attr}', () => ${exp}, ${argName} => {${exp} = ${argName}; $$apply();});
        `};
        } else if(name == 'style' && arg) {
            let styleName = arg;
            let exp = prop.value ? getExpression() : styleName;
            if(exp.indexOf('$element') >= 0) {
                return {bind: `{
                    let $element = ${makeEl()};
                    $runtime.bindStyle($cd, $element, '${styleName}', () => (${exp}));
                }`};
            } else {
                return {bind: `
                $runtime.bindStyle($cd, ${makeEl()}, '${styleName}', () => (${exp}));
            `};
            }
        } else if(name == 'use') {
            if(arg) {
                assert(isSimpleName(arg), 'Wrong name: ' + arg);
                this.checkRootName(arg);
                let args = prop.value ? `, () => [${getExpression()}]` : '';
                return {bind: `$runtime.bindAction($cd, ${makeEl()}, ${arg}${args});`};
            }
            let exp = getExpression();
            return {bind: `$tick(() => { let $element=${makeEl()}; ${exp}; $$apply(); });`};
        } else if(name == 'class') {
            if(node.__skipClass) return {};
            if(!this.css) return {prop: prop.content};
            
            node.__skipClass = true;
            let props = node.attributes.filter(a => a.name == 'class' || a.name.startsWith('class:'));

            let compound = props.some(prop => {
                let classes;
                if(prop.name == 'class') {
                    if(prop.value.indexOf('{') >= 0) return true;
                    classes = prop.value.trim().split(/\s+/);
                } else {
                    classes = [prop.name.slice(6)];
                }
                return classes.some(name => this.css.isExternalClass(name));
            });

            if(compound) {
                let defaultHash = '';
                if(node.classes.has(this.css.id)) defaultHash = `,'${this.css.id}'`;
                node.classes.clear();
                this.use.resolveClass = true;
                let exp = props.map(prop => {
                    if(prop.name == 'class') {
                        return this.parseText(prop.value).result;
                    } else {
                        let className = prop.name.slice(6);
                        assert(className);
                        let exp = prop.value ? unwrapExp(prop.value) : className;
                        return `(${exp}) ? \`${this.Q(className)}\` : ''`;
                    }
                }).join(') + \' \' + (');
                return {bind: `
                $watchReadOnly($cd, () => $$resolveClass((${exp})${defaultHash}), value => $runtime.setClassToElement(${makeEl()}, value));
            `};
            } else {
                let bind = [];
                props.forEach(prop => {
                    if(prop.name == 'class') {
                        prop.value.trim().split(/\s+/).forEach(name => {
                            node.classes.add(name);
                        });
                    } else {
                        let className = prop.name.slice(6);
                        assert(className);
                        let exp = prop.value ? unwrapExp(prop.value) : className;
                        bind.push(`$runtime.bindClass($cd, ${makeEl()}, () => !!(${exp}), '${className}');`);
                    }
                });
                return {bind: bind.join('\n')};
            }
        } else {
            if(prop.value && prop.value.indexOf('{') >= 0) {
                const parsed = this.parseText(prop.value);
                let exp = parsed.result;
                let hasElement = prop.value.indexOf('$element') >= 0;

                if(node.spreadObject) {
                    return {bind: `
                    ${node.spreadObject}.prop('${name}', () => ${exp});
                `};
                }
                const propList = {
                    hidden: true,
                    checked: true,
                    value: true,
                    disabled: true,
                    selected: true,
                    innerHTML: true,
                    innerText: true,
                    placeholder: true,
                    src: true
                };
                if(propList[name]) {
                    if(hasElement) {
                        return {bind: `{
                        let $element=${makeEl()};
                        $watchReadOnly($cd, () => (${exp}), (value) => {$element.${name} = value;});
                    }`};
                    } else {
                        return {bind: `$watchReadOnly($cd, () => (${exp}), (value) => {${makeEl()}.${name} = value;});`};
                    }
                } else {
                    if(hasElement) {
                        return {
                            bind: `{
                            let $element=${makeEl()};
                            $runtime.bindAttribute($cd, $element, '${name}', () => (${exp}));
                        }`
                        };
                    } else {
                        let el = makeEl();
                        return {
                            bind: `
                            $runtime.bindAttribute($cd, ${el}, '${name}', () => (${exp}));
                        `
                        };
                    }
                }
            }

            if(node.spreadObject) {
                return {bind: `
                ${node.spreadObject}.attr('${name}', '${prop.value}');
            `};
            }

            return {
                prop: prop.content
            }
        }
    }

    function makeifBlock(data, topElementName) {
        let source = [];

        let r = data.value.match(/^#if (.*)$/);
        let exp = r[1];
        assert(exp, 'Wrong binding: ' + data.value);

        let ifBlockName = 'ifBlock' + (this.uniqIndex++);
        source.push(`function ${ifBlockName}($cd, $parentElement) {`);
        let mainBlock, elseBlock;

        if(data.bodyMain) {
            mainBlock = this.buildBlock({body: data.bodyMain}, {protectLastTag: true});
            elseBlock = this.buildBlock(data, {protectLastTag: true});

            const convert = elseBlock.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            source.push(`
            let elsefr = ${convert}(\`${this.Q(elseBlock.tpl)}\`);
            ${elseBlock.source}
        `);
        } else {
            mainBlock = this.buildBlock(data, {protectLastTag: true});
        }
        const convert = mainBlock.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
        source.push(`
        let mainfr = ${convert}(\`${this.Q(mainBlock.tpl)}\`);
        ${mainBlock.source}
    `);

        if(elseBlock) {
            source.push(`
            $runtime.$$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name}, elsefr, ${elseBlock.name});
        `);
        } else {
            source.push(`
            $runtime.$$ifBlock($cd, $parentElement, () => !!(${exp}), mainfr, ${mainBlock.name});
        `);
        }
        source.push(`};\n ${ifBlockName}($cd, ${topElementName});`);
        
        return {
            source: source.join('\n')
        }
    }

    function makeEachBlock(data, option) {
        let source = [];

        let nodeItems = data.body;
        while(nodeItems.length) {
            let n = nodeItems[0];
            if(n.type == 'text' && !n.value.trim()) nodeItems.shift();
            else break;
        }
        while(nodeItems.length) {
            let n = nodeItems[nodeItems.length - 1];
            if(n.type == 'text' && !n.value.trim()) nodeItems.pop();
            else break;
        }
        if(!nodeItems.length) nodeItems = [data.body[0]];

        let itemData = this.buildBlock({body: nodeItems}, {protectLastTag: true});

        // #each items as item, index (key)
        let rx = data.value.match(/^#each\s+(\S+)\s+as\s+(.+)$/);
        assert(rx, `Wrong #each expression '${data.value}'`);
        let arrayName = rx[1];
        let right = rx[2];
        let keyName;
        let keyFunction;

        // get keyName
        rx = right.match(/^(.*)\s*\(\s*([^\(\)]+)\s*\)\s*$/);
        if(rx) {
            right = rx[1];
            keyName = rx[2];
        }
        right = right.trim();

        let itemName, indexName, keywords, bind0 = '';
        if(right[0] == '{') {
            rx = right.match(/^\{([^}]+)\}(.*)$/);
            assert(rx, `Wrong #each expression '${data.value}'`);
            keywords = rx[1].trim().split(/\s*\,\s*/);
            itemName = '$$item';
            indexName = rx[2].trim();
            if(indexName[0] == ',') indexName = indexName.substring(1).trim();
            indexName = indexName || '$index';

            let assignVars = keywords.map(k => `${k} = $$item.${k}`).join(', ');
            bind0 = `
            var ${assignVars};
            $ctx.cd.prefix.push(() => {
                ${assignVars};
            });
        `;
        } else {
            rx = right.trim().split(/\s*\,\s*/);
            assert(rx.length <= 2, `Wrong #each expression '${data.value}'`);
            itemName = rx[0];
            indexName = rx[1] || '$index';
        }
        assert(isSimpleName(itemName), `Wrong name '${itemName}'`);
        assert(isSimpleName(indexName), `Wrong name '${indexName}'`);

        if(keyName == itemName) keyName = null;
        if(keyName) assert(detectExpressionType(keyName) == 'identifier', `Wrong key '${keyName}'`);

        if(!keyName) keyFunction = 'let getKey = $runtime.noop;';
        else if(keyName == indexName) keyFunction = 'function getKey(_, i) {return i;}';
        else keyFunction = `function getKey(${itemName}) {return ${keyName};}`;

        const convert = itemData.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';

        source.push(`
        {
            function bind($ctx, $template, ${itemName}, ${indexName}) {
                ${bind0}
                ${itemData.source};
                ${itemData.name}($ctx.cd, $template);
                $ctx.rebind = function(_${indexName}, _${itemName}) {
                    ${indexName} = _${indexName};
                    ${itemName} = _${itemName};
                };
            };

            ${keyFunction};

            let itemTemplate = ${convert}(\`${this.Q(itemData.tpl)}\`);

            $runtime.$$eachBlock($cd, ${option.elName}, ${option.onlyChild?1:0}, () => (${arrayName}), getKey, itemTemplate, bind);
        }
    `);

        return {
            source: source.join('\n')
        };
    }

    function makeHtmlBlock(exp, topElementName) {
        return `$runtime.$$htmlBlock($cd, ${topElementName}, () => (${exp}));\n`;
    }

    function makeAwaitBlock(node, elementName) {
        let source = [];
        let valueForThen, exp;
        let rx = node.value.match(/^#await\s+(\S+)\s+then\s+(\S+)\s*$/);
        if(rx) {
            assert(!node.parts.then);
            node.parts.then = node.parts.main;
            node.parts.main = null;
            exp = rx[1];
            valueForThen = rx[2];
        } else {
            rx = node.value.match(/^#await\s+(\S+)\s*$/);
            assert(rx);
            exp = rx[1].trim();
        }

        let block_main, block_then, block_catch;
        let build_main, build_then, build_catch;
        let tpl_main, tpl_then, tpl_catch;
        if(node.parts.main && node.parts.main.length) {
            block_main = this.buildBlock({body: node.parts.main}, {protectLastTag: true});
            source.push(block_main.source);
            build_main = block_main.name;
            const convert = block_main.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            source.push(`const tpl_main = ${convert}(\`${this.Q(block_main.tpl)}\`);`);
            tpl_main = 'tpl_main';
        } else tpl_main = 'null';
        if(node.parts.then && node.parts.then.length) {
            let args = [];
            if(valueForThen) {
                assert(isSimpleName(valueForThen));
                args.push(valueForThen);
            } else {
                let rx = node.parts.thenValue.match(/^[^ ]+\s+(.*)$/);
                if(rx) {
                    assert(isSimpleName(rx[1]));
                    args.push(rx[1]);
                }
            }

            block_then = this.buildBlock({body: node.parts.then, args}, {protectLastTag: true});
            source.push(block_then.source);
            build_then = block_then.name;
            const convert = block_then.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            source.push(`const tpl_then = ${convert}(\`${this.Q(block_then.tpl)}\`);`);
            tpl_then = 'tpl_then';
        } else tpl_then = 'null';
        if(node.parts.catch && node.parts.catch.length) {
            let args = [];
            let rx = node.parts.catchValue.match(/^[^ ]+\s+(.*)$/);
            if(rx) {
                assert(isSimpleName(rx[1]));
                args.push(rx[1]);
            }

            block_catch = this.buildBlock({body: node.parts.catch, args}, {protectLastTag: true});
            source.push(block_catch.source);
            build_catch = block_catch.name;
            const convert = block_catch.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            source.push(`const tpl_catch = ${convert}(\`${this.Q(block_catch.tpl)}\`);`);
            tpl_catch = 'tpl_catch';
        } else tpl_catch = 'null';

        source.push(`
        $runtime.$$awaitBlock($cd, ${elementName}, () => ${exp}, $$apply, ${build_main}, ${build_then}, ${build_catch}, ${tpl_main}, ${tpl_then}, ${tpl_catch});
    `);

        return {source: `{
        ${source.join('\n')}
    }`};
    }

    function attachSlot(slotName, label, node) {
        let placeholder = '';

        let bind = [];
        if(node.attributes && node.attributes.length) {
            node.attributes.forEach(prop => {
                let name = prop.name;
                let value = prop.value;
                if(name[0] == '{') {
                    assert(value == null);
                    value = name;
                    name = unwrapExp(name);
                }            assert(value != null);
                assert(isSimpleName(name));
                if(value[0] == '{') {
                    value = unwrapExp(value);
                    bind.push(`
                    if('set_${name}' in s) {
                        $watch($cd, () => (${value}), s.set_${name}, {ro: true, cmp: $runtime.$$compareDeep});
                    }
                `);
                } else {
                    bind.push(`
                    if('set_${name}' in s) s.set_${name}(\`${this.Q(value)}\`);
                `);
                }
            });
        }
        if(node.body && node.body.length) {
            let block = this.buildBlock(node);
            const convert = block.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';
            placeholder = ` else {
            ${block.source};
            let $tpl = ${convert}(\`${this.Q(block.tpl)}\`);
            ${block.name}($cd, $tpl);
            ${label}.parentNode.insertBefore($tpl, ${label}.nextSibling);
        }`;
        }

        return {source: `{
        let $slot = $option.slots && $option.slots.${slotName};
        if($slot) {
            let s = $slot(${label}, $component);
            $runtime.cd_onDestroy($cd, s.destroy);
            ${bind.join('\n')}
        } ${placeholder};
    }`};
    }

    function makeFragment(node) {
        let rx = node.value.match(/#fragment\:(\S+)(.*)$/);
        assert(rx);
        let name = rx[1];
        let args = rx[2] ? rx[2].trim() : null;
        let head = [];
        assert(isSimpleName(name));
        if(args) {
            args = args.split(/\s*,\s*/);
            args.forEach(name => {
                assert(isSimpleName(name));
                head.push(`
                let ${name};
                if($$args.${name} != null) {
                    if(typeof $$args.${name} == 'function') {
                        $cd.prefix.push(() => {${name} = $$args.${name}()});
                    } else ${name} = $$args.${name};
                }
            `);
            });
        }

        let block;
        if(node.body && node.body.length) block = this.buildBlock(node);
        else {
            this.option.warning(`Empty fragment: '${node.value}'`);
            return {source: `function $fragment_${name}() {};`};
        }

        const convert = block.svg ? '$runtime.svgToFragment' : '$$htmlToFragment';

        return {source: `
        function $fragment_${name}($cd, label, $option) {
            let $$args = $option.args;
            ${head.join('\n')}

            ${block.source};
            let $tpl = ${convert}(\`${this.Q(block.tpl)}\`);
            ${block.name}($cd, $tpl);
            label.parentNode.insertBefore($tpl, label.nextSibling);
        };
    `};
    }


    function attachFragment(node, elementName) {
        let head = [];
        let name = node.elArg;
        assert(isSimpleName(name));

        node.attributes.forEach(prop => {
            let name = prop.name;
            let value = prop.value;

            if(name[0] == '@' || name.startsWith('on:')) {
                if(name[0] == '@') name = name.substring(1);
                else name = name.substring(3);

                if(name == '@') {
                    head.push(`events = $option.events;`);
                    return;
                }

                let args = name.split(':');
                name = args.shift();
                assert(isSimpleName(name));

                let exp, handler, isFunc;
                if(value) exp = unwrapExp(value);
                else {
                    if(args.length) handler = args.pop();
                    else {
                        head.push(`events.${name} = $option.events.${name};`);
                        return;
                    }
                }
                assert(!handler ^ !exp, prop.content);

                if(exp) {
                    let type = detectExpressionType(exp);
                    if(type == 'identifier') {
                        handler = exp;
                        exp = null;
                    } else {
                        isFunc = (type == 'function');
                    }
                }

                let callback;
                if(isFunc) {
                    callback = exp;
                } else if(handler) {
                    this.checkRootName(handler);
                    callback = handler;
                } else {
                    callback = `($event) => {${this.Q(exp)}}`;
                }
                head.push(`events.${name} = ${callback};`);
            } else {
                if(name[0] == '{') {
                    assert(!value);
                    value = name;
                    name = unwrapExp(name);
                }

                assert(isSimpleName(name));
                assert(value);
                if(value.indexOf('{') >= 0) {
                    let exp = unwrapExp(value);
                    head.push(`args.${name} = () => (${exp});`);
                } else {
                    head.push(`args.${name} = \`${this.Q(value)}\`;`);
                }
            }

        });

        return {source: `{
        let args = {};
        let events = {};
        ${head.join('\n')}
        $fragment_${name}($cd, ${elementName}, {args, events});
    }`};
    }

    const version = '0.6.6';


    async function compile(source, config = {}) {
        config = Object.assign({
            name: 'widget',
            warning: (w) => console.warn('!', w.message),
            exportDefault: true,
            inlineTemplate: false,
            hideLabel: false,
            compact: true,
            autoSubscribe: true,
            cssGenId: null,
            plugins: []
        }, config);

        const ctx = {
            source,
            config,
            uniqIndex: 0,
            
            Q: config.inlineTemplate ? Q2 : Q,
            buildBlock,
            bindProp,
            makeEachBlock,
            makeifBlock,
            makeComponent,
            makeHtmlBlock,
            parseText,
            makeAwaitBlock,
            attachSlot,
            makeFragment,
            attachFragment,
            checkRootName: checkRootName,
            use: {},

            DOM: null,
            parseHTML: parse,
            compactDOM,

            script: null,
            scriptNodes: null,
            js_parse: parse$1,
            js_transform: transform,
            js_build: build,
            js_shaking: shaking,

            styleNodes: null,
            css: null,
            processCSS,

            runtime: {componentHeader: []},
            result: null,
            buildRuntime
        };

        await hook(ctx, 'dom:before');
        ctx.parseHTML();
        await hook(ctx, 'dom');
        ctx.scriptNodes = [];
        ctx.styleNodes = [];
        ctx.DOM.body = ctx.DOM.body.filter(n => {
            if(n.type == 'script') {
                ctx.scriptNodes.push(n);
                return false;
            }
            if(n.type == 'style') {
                ctx.styleNodes.push(n);
                return false;
            }
            return true;
        });
        await hook(ctx, 'dom:check');
        assert(ctx.scriptNodes.length <= 1, 'Only one script section');
        await hook(ctx, 'dom:compact');
        if(config.compact) ctx.compactDOM();
        await hook(ctx, 'dom:after');

        await hook(ctx, 'js:before');
        ctx.js_parse();
        await hook(ctx, 'js');
        ctx.js_transform();
        await hook(ctx, 'js:after');

        await hook(ctx, 'css:before');
        ctx.processCSS();
        if(ctx.css) ctx.css.process(ctx.DOM);
        await hook(ctx, 'css');

        await hook(ctx, 'runtime:before');
        ctx.buildRuntime();
        await hook(ctx, 'runtime');


        await hook(ctx, 'build:before');
        ctx.js_shaking();
        await hook(ctx, 'build:shaking');
        ctx.js_build();
        await hook(ctx, 'build:assemble');
        let code = `
        import * as $runtime from 'malinajs/runtime.js';
        import { $watch, $watchReadOnly, $tick } from 'malinajs/runtime.js';
    `;

        if(config.hideLabel) {
            code += `import { $$htmlToFragmentClean as $$htmlToFragment } from 'malinajs/runtime.js';\n`;
        } else {
            code += `import { $$htmlToFragment } from 'malinajs/runtime.js';\n`;
        }

        if(config.injectRuntime) code += config.injectRuntime + '\n';

        let scriptCode = replace(ctx.script.code, '$$runtimeHeader()', ctx.runtime.header, 1);
        scriptCode = replace(scriptCode, '$$runtime()', ctx.runtime.body, 1);
        ctx.result = code + scriptCode;
        await hook(ctx, 'build');
        return ctx.result;
    }

    async function hook(ctx, name) {
        for(let i=0; i<ctx.config.plugins.length; i++) {
            const fn = ctx.config.plugins[i][name];
            if(fn) await fn(ctx);
        }
    }

    exports.compile = compile;
    exports.version = version;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=malina.js.map
