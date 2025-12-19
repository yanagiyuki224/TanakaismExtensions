const vscode = require('vscode');

// --- KEYWORDS_START ---
const K = {
    "VAR": "変数宣言",
    "PRINT": "表示",
    "INPUT": "受け取る",
    "LOOP": "ループ",
    "SCAN": "聞く",
    "COMMENT": "コメント",
    "IF": "もし",
    "ELIF": "違ったら",
    "ELSE": "それ以外",
    "END": "終了"
};
// --- KEYWORDS_END ---

// 正規表現用にエスケープする関数
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findLoopEnd(lines, currentPc) {
    let depth = 0;
    const startPattern = new RegExp(`^(${escapeRegex(K.LOOP)}|${escapeRegex(K.IF)})(\\s+|$)`);
    
    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(startPattern)) {
            depth++;
        } else if (line === K.END) {
            if (depth === 0) return i;
            depth--;
        }
    }
    return lines.length;
}

let memory = {};
let outputChannel;

// 条件式の評価
function evaluateCondition(condition, mem) {
    let evalStr = condition;
    for (let varName in mem) {
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        let val = mem[varName];
        evalStr = evalStr.replace(regex, typeof val === 'string' ? `"${val}"` : val);
    }
    try { return !!(eval(evalStr)); } catch (e) { return false; }
}

// ジャンプ先探し
function findJumpTarget(lines, currentPc) {
    let depth = 0;
    const ifPattern = new RegExp(`^${escapeRegex(K.IF)}(\\s+|$)`);
    const elifPattern = new RegExp(`^${escapeRegex(K.ELIF)}(\\s+|$)`);

    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(ifPattern)) { depth++; continue; }
        if (line === K.END) {
            if (depth === 0) return i;
            depth--;
            continue;
        }
        if (depth === 0 && (line.match(elifPattern) || line === K.ELSE)) {
            return i;
        }
    }
    return lines.length;
}

function findEndTag(lines, currentPc) {
    let depth = 0;
    const ifPattern = new RegExp(`^${escapeRegex(K.IF)}(\\s+|$)`);

    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(ifPattern)) depth++;
        if (line === K.END) {
            if (depth === 0) return i;
            depth--;
        }
    }
    return lines.length;
}

// VSCode用実行エンジン
async function executeCore(lines, channel) {
    memory = {};
    let pc = 0;
    let blockStack = []; // ブロック情報を保存するスタック
    const totalLines = lines.length;
    channel.appendLine(`--- Tanakaism 実行開始 ---`);

    while (pc < totalLines) {
        const line = lines[pc].trim();
        if (!line || line.startsWith(K.COMMENT)) { pc++; continue; }

        try {
            // 1. LOOP (ループ)
            const loopMatch = line.match(new RegExp(`^${escapeRegex(K.LOOP)}\\s+(.*)`));
            if (loopMatch) {
                const condition = loopMatch[1];
                if (evaluateCondition(condition, memory)) {
                    // ループ開始位置と条件を記録
                    blockStack.push({ type: 'LOOP', startPc: pc, condition: condition });
                    pc++;
                } else {
                    // 条件不成立ならループの終わりまでジャンプ
                    pc = findEndTag(lines, pc) + 1;
                }
                continue;
            }

            // 2. IF (もし)
            const ifMatch = line.match(new RegExp(`^${escapeRegex(K.IF)}\\s+(.*)`));
            if (ifMatch) {
                if (evaluateCondition(ifMatch[1], memory)) {
                    blockStack.push({ type: 'IF' });
                    pc++;
                } else {
                    pc = findJumpTarget(lines, pc);
                }
                continue;
            }

            // 3. END (終了) - 修正版
            if (line === K.END) {
                const lastBlock = blockStack.pop();
                if (lastBlock && lastBlock.type === 'LOOP') {
                    // ループの終わりなら、条件を再評価
                    if (evaluateCondition(lastBlock.condition, memory)) {
                        // 条件がまだ真ならループ開始位置に戻る（条件行自体に戻る）
                        blockStack.push(lastBlock);
                        pc = lastBlock.startPc; // ループの開始行に戻る（条件を再評価）
                    } else {
                        // 条件が偽になったらループを抜ける
                        pc++;
                    }
                } else {
                    // IF文などの終わりなら、ただ次に進む
                    pc++;
                }
                continue;
            }

            // 4. ELIF (違ったら)
            const elifMatch = line.match(new RegExp(`^${escapeRegex(K.ELIF)}\\s+(.*)`));
            if (elifMatch) {
                pc = findEndTag(lines, pc);
                pc++;
                continue;
            }

            // 5. ELSE (それ以外)
            if (line === K.ELSE) {
                pc = findEndTag(lines, pc);
                pc++;
                continue;
            }

            // 6. VAR (変数宣言)
            const varMatch = line.match(new RegExp(`^${escapeRegex(K.VAR)}\\s+(\\w+)\\s*=\\s*(.*)`));
            if (varMatch) {
                const var_name = varMatch[1];
                let val = varMatch[2].trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                    memory[var_name] = val.slice(1, -1);
                } else {
                    let evalStr = val;
                    for (let v in memory) {
                        evalStr = evalStr.replace(new RegExp(`\\b${v}\\b`, 'g'), memory[v]);
                    }
                    memory[var_name] = eval(evalStr);
                }
                pc++;
                continue;
            }

            // 7. PRINT (表示)
            const printMatch = line.match(new RegExp(`^${escapeRegex(K.PRINT)}\\s+(.*)`));
            if (printMatch) {
                let expr = printMatch[1].trim();
                try {
                    let evalExpr = expr;
                    for (let v in memory) {
                        const regex = new RegExp(`\\b${v}\\b`, 'g');
                        const val = typeof memory[v] === 'string' ? JSON.stringify(memory[v]) : memory[v];
                        evalExpr = evalExpr.replace(regex, val);
                    }
                    let out = eval(evalExpr);
                    channel.appendLine(String(out));
                } catch (e) {
                    channel.appendLine(memory.hasOwnProperty(expr) ? String(memory[expr]) : expr.replace(/"/g, ''));
                }
                pc++;
                continue;
            }

            // 8. INPUT (受け取る)
            const inputMatch = line.match(new RegExp(`^${escapeRegex(K.INPUT)}\\s+(\\w+)`));
            if (inputMatch) {
                const varName = inputMatch[1];
                const userInput = await vscode.window.showInputBox({
                    prompt: `${varName} の値を入力してください`
                });

                if (userInput === undefined) {
                    channel.appendLine(`[Line ${pc + 1}] 入力がキャンセルされました`);
                    pc++;
                    continue;
                }

                memory[varName] = isNaN(userInput) ? userInput : Number(userInput);
                pc++;
                continue;
            }

            // 9. SCAN (聞く)
            const scanMatch = line.match(new RegExp(`^(\\w+)\\s*=\\s*${escapeRegex(K.SCAN)}\\s+(.*)`));
            if (scanMatch) {
                const varName = scanMatch[1];
                let promptExpr = scanMatch[2].trim();

                let evalPrompt = promptExpr;
                for (let v in memory) {
                    const regex = new RegExp(`\\b${v}\\b`, 'g');
                    const val = typeof memory[v] === 'string' ? JSON.stringify(memory[v]) : memory[v];
                    evalPrompt = evalPrompt.replace(regex, val);
                }

                try {
                    const finalPrompt = eval(evalPrompt);
                    const userInput = await vscode.window.showInputBox({
                        prompt: String(finalPrompt)
                    });

                    if (userInput !== undefined) {
                        memory[varName] = isNaN(userInput) || userInput === "" ? userInput : Number(userInput);
                    }
                } catch (e) {
                    channel.appendLine(`[Line ${pc + 1}] 質問内容のエラー: ${e.message}`);
                }
                pc++;
                continue;
            }

            channel.appendLine(`[Line ${pc + 1}] 未知のコマンド: ${line}`);
        } catch (e) {
            channel.appendLine(`[Line ${pc + 1}] エラー: ${e.message}`);
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
        executeCore(textEditor.document.getText().split(/\r?\n/), outputChannel);
    });

    const provider = vscode.languages.registerCompletionItemProvider('tanakaism', {
        provideCompletionItems() {
            return Object.values(K).map(k => new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword));
        }
    });

    context.subscriptions.push(runCommand, provider);
}

function deactivate() {
    if (outputChannel) outputChannel.dispose();
}

module.exports = { activate, deactivate };