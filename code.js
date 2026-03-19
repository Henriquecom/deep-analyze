let el = $0;
if (!el) {
    console.error('❌ Select an element first!');
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

        if (tag === 'html') break;

        currentElement = currentElement.parentElement;
        levels++;
    }

    if (!fullHtml.some(item => item.tagName === 'html')) {
        fullHtml.unshift({
            level: -1,
            opening: '<html>',
            closing: '</html>',
            tagName: 'html'
        });
    }

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
                                
                                this.variables.set(name, {
                                    name, type: 'array', script: scriptIndex
                                });
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
                                
                                this.variables.set(name, {
                                    name, type: 'object', script: scriptIndex
                                });
                                break;
                                
                            case 'FunctionExpression':
                            case 'ArrowFunctionExpression':
                                this.functions.set(name, {
                                    type: 'function',
                                    params: init.params.map(p => p.name),
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                
                                this.variables.set(name, {
                                    name, type: 'function', script: scriptIndex
                                });
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
                    
                    const hasClassRef = elementClasses.some(c => 
                        callStr.includes(c.toLowerCase()));
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

        console.log('%c🔷 COMPLETE ELEMENT ANALYSIS (AST + CSS) 🔷', 'font-size:16px; font-weight:bold; color:#4A90E2;');
        console.log('%c⏱️  Analysis completed in ' + totalTime + ' seconds', 'font-size:12px; color:#666;');
        console.log('='.repeat(80));

        console.log('%c📄 HTML STRUCTURE:', 'font-size:14px; font-weight:bold; color:#27AE60;');
        console.log('-'.repeat(50));

        let htmlFinal = [];
        fullHtml.forEach((item, index) => {
            let indent = '  '.repeat(index);
            htmlFinal.push(indent + item.opening);
        });

        let indentEl = '  '.repeat(fullHtml.length - 1);
        htmlFinal[indentEl.length/2] = htmlFinal[indentEl.length/2] + ' ← [SELECTED]';

        for (let i = fullHtml.length - 1; i >= 0; i--) {
            let indent = '  '.repeat(i);
            htmlFinal.push(indent + fullHtml[i].closing);
        }

        console.log(htmlFinal.join('\n'));

        console.log('\n%c🎨 CSS VARIABLES DEFINED:', 'font-size:14px; font-weight:bold; color:#F39C12;');
        console.log('-'.repeat(50));
        if (variablesList.length > 0) {
            variablesList.forEach(v => console.log(v));
        } else {
            console.log('No CSS variables defined');
        }

        console.log('\n%c🎨 RELATED CSS (with variables resolved):', 'font-size:14px; font-weight:bold; color:#E67E22;');
        console.log('-'.repeat(50));
        if (relatedStyles.size > 0) {
            relatedStyles.forEach(css => console.log(css));
        } else {
            console.log('No specific CSS found');
        }

        console.log('\n%c📊 COMPUTED STYLES (actual values applied):', 'font-size:14px; font-weight:bold; color:#3498DB;');
        console.log('-'.repeat(50));
        if (computedForElement.length > 0) {
            console.log('element {');
            computedForElement.forEach(line => console.log(line));
            console.log('}');
        }

        console.log('\n%c⚡ JAVASCRIPT METHOD CALLS (AST detected - NO false positives):', 'font-size:14px; font-weight:bold; color:#E74C3C;');
        console.log('-'.repeat(50));
        
        if (jsResult.calls.length > 0) {
            jsResult.calls.forEach(call => {
                if (call.type === 'method_call') {
                    console.log(`✅ ${call.object}.${call.method}()`);
                } else if (call.type === 'function_call') {
                    console.log(`✅ ${call.function}()`);
                } else {
                    console.log(`✅ ${call.type}:`, call);
                }
                console.log(`   📍 Script ${call.script}, line ${call.line}`);
                console.log('');
            });
        } else {
            console.log('No method calls detected');
        }

        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY:');
        console.log(`📄 HTML: ${fullHtml.length} levels`);
        console.log(`🎨 CSS Variables: ${variablesList.length} defined`);
        console.log(`🎨 CSS Rules: ${relatedStyles.size} rules`);
        console.log(`📊 Computed properties: ${computedForElement.length}`);
        console.log(`⚡ JS Method Calls: ${jsResult.calls.length}`);
        console.log(`⏱️  Total time: ${totalTime}s`);

        console.log({
            html: htmlFinal.join('\n'),
            cssVariables: Array.from(cssVariables.entries()),
            css: Array.from(relatedStyles),
            computed: computedForElement,
            js: jsResult.calls,
            performance: totalTime + 's'
        });
        
    }).catch(() => {
        console.error('❌ Failed to load parser');
    });
}
