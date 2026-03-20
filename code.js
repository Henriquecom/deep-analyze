let el = $0;
if (!el) {
    console.error('❌ You need to select an element first!');
} else {
    const startTime = performance.now();

    function resolveCSSVariables(cssText) {
        const varRegex = /var\(--[^,)]+(?:,[^)]+)?\)/g;
        const matches = cssText.match(varRegex);
        if (!matches) return cssText;

        let resolvedText = cssText;
        const computedStyle = getComputedStyle(document.documentElement);

        matches.forEach(match => {
            const innerMatch = match.match(/var\((--[^,)]+)(?:,\s*([^)]+))?\)/);
            if (innerMatch) {
                const varName = innerMatch[1];
                const fallback = innerMatch[2] || '';

                let value = computedStyle.getPropertyValue(varName).trim();

                if (!value && el) {
                    value = getComputedStyle(el).getPropertyValue(varName).trim();
                }

                if (value) {
                    resolvedText = resolvedText.replace(match, value);
                } else if (fallback) {
                    resolvedText = resolvedText.replace(match, fallback.trim());
                }
            }
        });

        if (resolvedText.match(varRegex)) {
            return resolveCSSVariables(resolvedText);
        }
        return resolvedText;
    }

    function getComputedCSSForElement(element) {
        const computed = getComputedStyle(element);
        const importantProps = [
            'display', 'position', 'width', 'height', 'margin', 'padding',
            'color', 'background-color', 'font-size', 'font-weight',
            'border', 'flex', 'grid', 'opacity', 'z-index', 'overflow',
            'transform', 'transition', 'animation'
        ];

        let result = [];
        importantProps.forEach(prop => {
            const value = computed.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== '0px') {
                result.push(`  ${prop}: ${value};`);
            }
        });
        return result;
    }

    // Coleta da estrutura HTML
    let fullHtml = [];
    let currentElement = el;
    let levels = 0;
    let allElements = [];

    while (currentElement && currentElement.tagName) {
        allElements.unshift(currentElement);
        let tag = currentElement.tagName.toLowerCase();
        let id = currentElement.id ? ` id="${currentElement.id}"` : '';
        let classes = currentElement.className ? ` class="${currentElement.className}"` : '';

        let otherAttributes = '';
        Array.from(currentElement.attributes).forEach(attr => {
            if (attr.name !== 'id' && attr.name !== 'class') {
                otherAttributes += ` ${attr.name}="${attr.value}"`;
            }
        });

        let opening = `<${tag}${id}${classes}${otherAttributes}>`;
        let closing = `</${tag}>`;

        fullHtml.unshift({
            level: levels,
            opening: opening,
            closing: closing,
            element: currentElement,
            tagName: tag
        });

        if (tag === 'body') break;
        currentElement = currentElement.parentElement;
        levels++;
    }

    if (!fullHtml.some(item => item.tagName === 'body')) {
        fullHtml.unshift({
            level: -1,
            opening: '<body>',
            closing: '</body>',
            tagName: 'body'
        });
    }

    // Coleta de estilos e variáveis CSS
    let relatedStyles = new Set();
    let cssVariables = new Map();
    let selectorsToSearch = [];

    allElements.forEach(elem => {
        if (elem.id) selectorsToSearch.push(`#${elem.id}`);
        if (elem.className) {
            elem.className.split(' ').forEach(c => {
                if (c.trim()) selectorsToSearch.push(`.${c}`);
            });
        }
        selectorsToSearch.push(elem.tagName.toLowerCase());
    });
    selectorsToSearch = [...new Set(selectorsToSearch)];

    try {
        for (let sheet of document.styleSheets) {
            try {
                for (let rule of sheet.cssRules || []) {
                    if (rule.selectorText === ':root' || rule.selectorText === 'html') {
                        for (let prop of rule.style) {
                            if (prop.startsWith('--')) {
                                cssVariables.set(prop, rule.style.getPropertyValue(prop).trim());
                            }
                        }
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}

    try {
        for (let sheet of document.styleSheets) {
            try {
                for (let rule of sheet.cssRules || []) {
                    selectorsToSearch.forEach(sel => {
                        if (rule.selectorText?.includes(sel)) {
                            let originalCSS = rule.cssText;
                            let resolvedCSS = resolveCSSVariables(rule.cssText);
                            if (originalCSS !== resolvedCSS) {
                                relatedStyles.add(`📝 Original: ${originalCSS}`);
                                relatedStyles.add(`✅ Solved: ${resolvedCSS}`);
                                relatedStyles.add('---');
                            } else {
                                relatedStyles.add(originalCSS);
                            }
                        }
                    });
                }
            } catch (e) {}
        }
    } catch (e) {}

    let computedForElement = getComputedCSSForElement(el);

    let variablesList = [];
    cssVariables.forEach((value, name) => {
        variablesList.push(`  ${name}: ${value}`);
    });

    // Análise de JavaScript
    let output = [];
    let uniqueLines = new Set();
    let relatedElements = new Set();
    let relationships = [];

    let namesToSearch = new Set();
    if (el.id) namesToSearch.add(el.id);
    if (el.className) {
        el.className.split(' ').filter(c => c.trim()).forEach(c => namesToSearch.add(c));
    }
    Array.from(el.attributes).forEach(attr => {
        if (attr.value && (attr.value.includes('-') || /[a-z]/i.test(attr.value))) {
            namesToSearch.add(attr.value);
        }
    });
    namesToSearch.add(el.tagName.toLowerCase());

    let scripts = Array.from(document.querySelectorAll('script'))
        .map(s => s.textContent)
        .filter(t => t && t.length > 0);

    let seen = new Set();
    let allNames = new Set(namesToSearch);

    let manipulationMethods = [
        'setAttribute', 'removeAttribute', 'appendChild', 'removeChild',
        'insertAdjacentHTML', 'innerHTML', 'outerHTML', 'insertAdjacentText',
        'classList.add', 'classList.remove', 'classList.toggle', 'classList.replace',
        'addEventListener', 'removeEventListener', 'style', 'css', 'attr',
        'addClass', 'removeClass', 'toggleClass', 'hasClass', 'prop', 'val',
        'after', 'before', 'append', 'prepend', 'remove', 'empty', 'html', 'text',
        'replaceChild', 'insertBefore', 'cloneNode', 'replaceWith', 'insertAdjacentElement',
        'scrollIntoView', 'focus', 'blur', 'click', 'submit', 'reset'
    ];

    function findElementsInCode(line) {
        let elements = [];
        let matches = line.match(/querySelector\(['"]([^'"]+)['"]\)/g) || [];
        matches.forEach(m => {
            let selector = m.replace(/querySelector\(['"]/, '').replace(/['"]\)/, '');
            elements.push(selector);
        });
        matches = line.match(/getElementById\(['"]([^'"]+)['"]\)/g) || [];
        matches.forEach(m => {
            let id = m.replace(/getElementById\(['"]/, '').replace(/['"]\)/, '');
            elements.push('#' + id);
        });
        return elements;
    }

    function extractNamesFromCode(code) {
        let names = new Set();
        let matches = code.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
        matches.forEach(name => {
            if (name.length > 1 && 
                !['var','let','const','function','return','if','else','for','while',
                  'this','true','false','null','undefined','new','typeof','instanceof',
                  'document','window','console','alert','setTimeout','setInterval',
                  'Array','Object','String','Number','Boolean','Promise','async',
                  'await','try','catch','finally','throw','class','extends',
                  'import','export','default','from','as','break','continue',
                  'switch','case','default','do','in','of','typeof','void',
                  'delete','instanceof','new','super','yield'].includes(name)) {
                names.add(name);
            }
        });
        return names;
    }

    function trace(name, level) {
        if (level > 1000) return;
        let key = name + ':' + level;
        if (seen.has(key)) return;
        seen.add(key);

        scripts.forEach((script, idx) => {
            let lines = script.split('\n');
            lines.forEach((line, i) => {
                if (!line.includes(name)) return;

                let spaces = '  '.repeat(Math.min(level, 20));
                let cleanLine = line.trim();

                let hasMethod = manipulationMethods.some(method => line.includes(method));
                let isDefinition = 
                    line.includes('var ' + name) ||
                    line.includes('let ' + name) ||
                    line.includes('const ' + name) ||
                    line.includes('function ' + name) ||
                    line.match(new RegExp(name + '\\s*=\\s*function')) ||
                    line.match(new RegExp(name + '\\s*[:=]\\s*\\([^)]*\\)\\s*=>'));

                if (hasMethod || isDefinition) {
                    let marker = hasMethod ? '⚡' : '📌';
                    let formattedLine = spaces + `${marker} [${level}] Script ${idx}:${i+1} | ${cleanLine}`;
                    output.push(formattedLine);
                    uniqueLines.add(cleanLine);

                    let elementsInLine = findElementsInCode(line);
                    if (elementsInLine.length > 0) {
                        elementsInLine.forEach(sel => {
                            relatedElements.add(sel);
                            relationships.push({
                                from: name,
                                to: sel,
                                action: cleanLine,
                                script: idx,
                                line: i+1
                            });
                        });
                    }

                    let newNames = extractNamesFromCode(line);
                    newNames.forEach(newName => {
                        if (newName !== name && !allNames.has(newName)) {
                            allNames.add(newName);
                            trace(newName, level + 1);
                        }
                    });
                }
            });
        });
    }

    namesToSearch.forEach(name => trace(name, 0));

    async function loadParser() {
        if (window.acorn) return window.acorn;
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/acorn@8.8.2/dist/acorn.js';
            script.onload = () => {
                const walkScript = document.createElement('script');
                walkScript.src = 'https://unpkg.com/acorn-walk@8.2.0/dist/walk.js';
                walkScript.onload = () => resolve(window.acorn);
                document.head.appendChild(walkScript);
            };
            document.head.appendChild(script);
        });
    }

    loadParser().then(acorn => {
        const walk = window.acorn.walk;

        class VariableAnalyzer {
            constructor() {
                this.variables = new Map();
                this.methodCalls = [];
                this.functions = new Map();
                this.arrays = new Map();
                this.objects = new Map();
            }

            analyzeScripts() {
                const scripts = Array.from(document.querySelectorAll('script'))
                    .map(s => s.textContent)
                    .filter(t => t && t.length > 0);

                scripts.forEach((code, scriptIndex) => {
                    try {
                        const ast = acorn.parse(code, {
                            ecmaVersion: 2020,
                            locations: true
                        });
                        this.collectDeclarations(ast, scriptIndex);
                        this.detectMethodCalls(ast, scriptIndex);
                    } catch (e) {}
                });
            }

            collectDeclarations(ast, scriptIndex) {
                walk.simple(ast, {
                    VariableDeclarator: (node) => {
                        const name = node.id.name;
                        const init = node.init;

                        if (!init) {
                            this.variables.set(name, {
                                name, type: 'undefined', script: scriptIndex
                            });
                            return;
                        }

                        switch(init.type) {
                            case 'ArrayExpression':
                                const elements = init.elements.map(e => {
                                    if (e.type === 'Literal') return e.value;
                                    if (e.type === 'Identifier') return `ref:${e.name}`;
                                    return 'unknown';
                                });
                                this.arrays.set(name, {
                                    type: 'array',
                                    elements,
                                    length: init.elements.length,
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                this.variables.set(name, { name, type: 'array', script: scriptIndex });
                                break;
                            case 'ObjectExpression':
                                const props = {};
                                init.properties.forEach(prop => {
                                    const key = prop.key.name || prop.key.value;
                                    props[key] = prop.value.type;
                                });
                                this.objects.set(name, {
                                    type: 'object',
                                    properties: props,
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                this.variables.set(name, { name, type: 'object', script: scriptIndex });
                                break;
                            case 'FunctionExpression':
                            case 'ArrowFunctionExpression':
                                this.functions.set(name, {
                                    type: 'function',
                                    params: init.params.map(p => p.name),
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                this.variables.set(name, { name, type: 'function', script: scriptIndex });
                                break;
                            case 'Literal':
                                this.variables.set(name, {
                                    name, 
                                    type: typeof init.value,
                                    value: init.value,
                                    script: scriptIndex
                                });
                                break;
                            case 'Identifier':
                                this.variables.set(name, {
                                    name,
                                    type: 'reference',
                                    refersTo: init.name,
                                    script: scriptIndex
                                });
                                break;
                            case 'CallExpression':
                                const methodName = init.callee.type === 'MemberExpression' 
                                    ? init.callee.property.name 
                                    : init.callee.name;
                                this.variables.set(name, {
                                    name,
                                    type: 'call_result',
                                    called: methodName,
                                    executes: true,
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                break;
                        }
                    },
                    FunctionDeclaration: (node) => {
                        this.functions.set(node.id.name, {
                            type: 'function',
                            params: node.params.map(p => p.name),
                            line: node.loc?.start.line,
                            script: scriptIndex
                        });
                        this.variables.set(node.id.name, {
                            name: node.id.name, type: 'function', script: scriptIndex
                        });
                    }
                });
            }

            detectMethodCalls(ast, scriptIndex) {
                walk.simple(ast, {
                    CallExpression: (node) => {
                        if (node.callee.type === 'MemberExpression') {
                            const object = node.callee.object.name;
                            const method = node.callee.property.name;
                            this.methodCalls.push({
                                type: 'method_call',
                                object,
                                method,
                                line: node.loc?.start.line,
                                script: scriptIndex
                            });
                            return;
                        }
                        if (node.callee.type === 'Identifier') {
                            const funcName = node.callee.name;
                            this.methodCalls.push({
                                type: 'function_call',
                                function: funcName,
                                line: node.loc?.start.line,
                                script: scriptIndex
                            });
                        }
                    },
                    NewExpression: (node) => {
                        this.methodCalls.push({
                            type: 'constructor_call',
                            constructor: node.callee.name,
                            line: node.loc?.start.line,
                            script: scriptIndex
                        });
                    }
                });
            }

            getMethodsRelatedTo(element) {
                const elementClasses = Array.from(element.classList);
                const elementId = element.id;
                const elementTag = element.tagName.toLowerCase();

                const relevant = this.methodCalls.filter(call => {
                    const callStr = JSON.stringify(call).toLowerCase();
                    const hasClassRef = elementClasses.some(c => callStr.includes(c.toLowerCase()));
                    const hasIdRef = elementId && callStr.includes(elementId.toLowerCase());
                    const hasTagRef = callStr.includes(elementTag);
                    return hasClassRef || hasIdRef || hasTagRef;
                });

                return {
                    calls: relevant,
                    variables: Array.from(this.variables.entries()),
                    arrays: Array.from(this.arrays.entries()),
                    objects: Array.from(this.objects.entries()),
                    functions: Array.from(this.functions.entries())
                };
            }
        }

        const analyzer = new VariableAnalyzer();
        analyzer.analyzeScripts();
        const jsResult = analyzer.getMethodsRelatedTo(el);

        const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);

        // Preparação da saída HTML para o objeto final
        let htmlFinalOutput = [];
        fullHtml.forEach((item, index) => {
            let indent = '  '.repeat(index);
            htmlFinalOutput.push(indent + item.opening);
        });
        let indentEl = '  '.repeat(fullHtml.length - 1);
        htmlFinalOutput[indentEl.length/2] = htmlFinalOutput[indentEl.length/2] + ' ← [SELECTED]';
        for (let i = fullHtml.length - 1; i >= 0; i--) {
            let indent = '  '.repeat(i);
            htmlFinalOutput.push(indent + fullHtml[i].closing);
        }

        // Sumário (console.log puro)
        console.log('📊 SUMMARY:');
        console.log(`📄 HTML: ${fullHtml.length} levels (to BODY)`);
        console.log(`🎨 CSS Variables: ${variablesList.length} defined`);
        console.log(`🎨 CSS Rules: ${relatedStyles.size} rules`);
        console.log(`📊 Computed properties: ${computedForElement.length}`);
        console.log(`🔗 Related elements (recursive): ${relatedElements.size}`);
        console.log(`⚡ AST Method Calls: ${jsResult.calls.length}`);
        console.log(`📜 JS lines (recursive): ${uniqueLines.size}`);
        console.log(`⏱️  Total time: ${totalTime}s`);

        // Objeto final (console.log puro)
        console.log({
            html: htmlFinalOutput.join('\n'),
            cssVariables: Array.from(cssVariables.entries()),
            css: Array.from(relatedStyles),
            computed: computedForElement,
            jsRecursive: Array.from(uniqueLines),
            jsAST: jsResult.calls,
            relatedElements: Array.from(relatedElements),
            relationships: relationships,
            performance: totalTime + 's'
        });

    }).catch(() => {
        console.error('❌ Failed to load parser');
    });
}
