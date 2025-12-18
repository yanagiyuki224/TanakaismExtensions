const vscode = require('vscode');

let memory = {};
let outputChannel;

// 条件式の評価
function evaluateCondition(condition, mem) {
    let evalStr = condition;
    for (let varName in mem) {
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        evalStr = evalStr.replace(regex, JSON.stringify(mem[varName]));
    }
    try { return !!(eval(evalStr)); } catch (e) { return false; }
}

// elif/else/end探し（入れ子を考慮）
function findJumpTarget(lines, currentPc) {
    let depth = 0;
    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 入れ子のifを検出
        if (line.match(/^if\b/)) {
            depth++;
            continue;
        }
        
        // endを検出
        if (line === 'end') {
            if (depth === 0) {
                return i; // 同じレベルのendに到達
            }
            depth--;
            continue;
        }
        
        // 同じレベルのelif/elseを探す
        if (depth === 0 && (line.match(/^elif\b/) || line === 'else')) {
            return i;
        }
    }
    return lines.length;
}

// end探し（入れ子を考慮）
function findEndTag(lines, currentPc) {
    let depth = 0;
    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(/^if\b/)) depth++;
        if (line === 'end') {
            if (depth === 0) return i;
            depth--;
        }
    }
    return lines.length;
}

// VSCode用実行エンジン
function executeCore(lines, channel) {
    memory = {};
    let pc = 0;
    const totalLines = lines.length;
    channel.appendLine("--- Tanakaism 実行開始 ---");

    while (pc < totalLines) {
        const line = lines[pc].trim();
        if (!line || line.startsWith('love')) { pc++; continue; }

        try {
            // IF文の処理
            const ifMatch = line.match(/^if\s+(.*)/);
            if (ifMatch) {
                const condition = ifMatch[1];
                if (evaluateCondition(condition, memory)) {
                    pc++; // 条件が真なら次の行へ
                } else {
                    pc = findJumpTarget(lines, pc); // 偽ならelif/else/endへジャンプ
                }
                continue;
            }
            
            // ELIF文の処理
            const elifMatch = line.match(/^elif\s+(.*)/);
            if (elifMatch) {
                const condition = elifMatch[1];
                if (evaluateCondition(condition, memory)) {
                    pc++; // 条件が真なら次の行へ
                } else {
                    pc = findJumpTarget(lines, pc); // 偽なら次のelif/else/endへ
                }
                continue;
            }
            
            // ELSE文の処理
            if (line === 'else') {
                pc++; // elseブロックに入る
                continue;
            }
            
            // END文の処理
            if (line === 'end') {
                pc++;
                continue;
            }

            // TANAKA文の処理
            if (line.startsWith('tanaka')) {
                const match = line.match(/tanaka\s+(\w+)\s*=\s*(.*)/);
                if (match) {
                    const var_name = match[1];
                    let val = match[2].trim();
                    
                    if (val.startsWith('"') && val.endsWith('"')) {
                        memory[var_name] = val.slice(1, -1);
                    } else {
                        // 変数を展開して評価
                        let evalStr = val;
                        for (let v in memory) {
                            evalStr = evalStr.replace(new RegExp(`\\b${v}\\b`, 'g'), memory[v]);
                        }
                        memory[var_name] = isNaN(evalStr) ? evalStr : eval(evalStr);
                    }
                }
            } 
            // GIVE文の処理
            else if (line.startsWith('give')) {
                const expr = line.substring(4).trim();
                let out;
                if (expr.startsWith('"') && expr.endsWith('"')) {
                    out = expr.slice(1, -1);
                } else if (memory.hasOwnProperty(expr)) {
                    out = memory[expr];
                } else {
                    out = expr;
                }
                channel.appendLine(String(out));
            }
        } catch (e) {
            channel.appendLine(`[Line ${pc+1}] エラー: ${e.message}`);
        }
        pc++;
    }
    channel.appendLine("--- 実行終了 ---");
}

function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Tanakaism Output");

    let runCommand = vscode.commands.registerTextEditorCommand('oreore.runTanakaism', (textEditor) => {
        if (textEditor.document.languageId !== 'tanakaism') return;
        outputChannel.show(true);
        outputChannel.clear();
        const lines = textEditor.document.getText().split(/\r?\n/);
        executeCore(lines, outputChannel);
    });

    const provider = vscode.languages.registerCompletionItemProvider('tanakaism', {
        provideCompletionItems() {
            return ['tanaka', 'give', 'love', 'if', 'elif', 'else', 'end'].map(k => {
                return new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword);
            });
        }
    });

    context.subscriptions.push(runCommand, provider);
}

function deactivate() {
    if (outputChannel) outputChannel.dispose();
}

module.exports = { activate, deactivate };