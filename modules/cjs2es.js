!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports,require("acorn")):"function"==typeof define&&define.amd?define(["exports","acorn"],t):t((e=e||self).cjs2es={},e.acorn)}(this,(function(e,t){"use strict";e.cjs2es=function(e){const o="function require(id) {\n    if (id in __cjs2es_lookup) return __cjs2es_lookup[id];\n    throw new Error(`Cannot require modules dynamically (${id})`);\n}";if(!/\b(require|module|exports)\b/.test(e))return e;try{const r=t.parse(e,{ecmaVersion:9}),n=[];!function e(t,o){if("object"!=typeof t)return;t.type&&o(t);for(let r in t){let n=t[r];n&&"object"==typeof n&&(Array.isArray(n)?n:[n]).forEach(t=>e(t,o))}}(r,e=>{if("CallExpression"===e.type&&"require"===e.callee.name){if(1!==e.arguments.length)return;const t=e.arguments[0];if("Literal"!==t.type||"string"!=typeof t.value)return;n.push(t.value)}});const s=n.map((e,t)=>`import __cjs2es_${t} from '${e}';`).join("\n");return[s,`const __cjs2es_lookup = { ${n.map((e,t)=>`'${e}': __cjs2es_${t}`).join(", ")} };`,o,"const exports = {}; const module = { exports };",e,"export default module.exports;"].join("\n\n")}catch(t){return e}},Object.defineProperty(e,"__esModule",{value:!0})}));
