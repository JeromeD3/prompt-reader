"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class PromptReaderViewProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        // 添加消息处理程序
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'setPath':
                    await vscode.commands.executeCommand('prompt-reader.setPromptsPath');
                    break;
                case 'promptCopied':
                    vscode.window.showInformationMessage('提示词已复制到剪贴板');
                    break;
                case 'savePrompt':
                    if (message.content) {
                        try {
                            await this.savePromptToFile(message.content);
                            vscode.window.showInformationMessage('提示词已成功保存');
                        }
                        catch (error) {
                            vscode.window.showErrorMessage(`保存提示词失败: ${error}`);
                        }
                    }
                    break;
            }
        });
        this.setupFileWatcher();
        this.updateContent();
    }
    async updateContent() {
        if (!this._view) {
            return;
        }
        const config = vscode.workspace.getConfiguration('promptReader');
        const promptsPath = config.get('promptsPath');
        if (!promptsPath) {
            this._view.webview.html = this.getNoPathHtml();
            return;
        }
        try {
            const content = fs.readFileSync(promptsPath, 'utf8');
            this._view.webview.html = this.getWebviewContent(content);
        }
        catch (error) {
            this._view.webview.html = this.getErrorHtml(String(error));
        }
    }
    // 设置文件监听器
    setupFileWatcher() {
        // 先清除旧的监听器
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
        }
        const config = vscode.workspace.getConfiguration('promptReader');
        const promptsPath = config.get('promptsPath');
        if (promptsPath) {
            try {
                // 创建监听特定文件的监听器
                this._fileWatcher = vscode.workspace.createFileSystemWatcher(promptsPath);
                // 监听文件变化事件
                this._fileWatcher.onDidChange(() => {
                    console.log('提示词文件已变更，正在更新视图...');
                    this.updateContent();
                });
                // 监听文件删除事件
                this._fileWatcher.onDidDelete(() => {
                    vscode.window.showWarningMessage('提示词文件已被删除');
                    this.updateContent();
                });
            }
            catch (error) {
                console.error('创建文件监听器失败:', error);
            }
        }
    }
    // 当配置发生变化时更新文件监听器
    updateFileWatcher() {
        this.setupFileWatcher();
    }
    getNoPathHtml() {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Prompt Reader</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 12px;
                        border-radius: 2px;
                        cursor: pointer;
                        margin-top: 20px;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h3>未设置提示词文件路径</h3>
                    <p>请设置提示词 Markdown 文件的路径</p>
                    <button id="setPath">设置路径</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.getElementById('setPath').addEventListener('click', () => {
                        vscode.postMessage({ command: 'setPath' });
                    });
                </script>
            </body>
            </html>`;
    }
    getErrorHtml(error) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Prompt Reader</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                    }
                </style>
            </head>
            <body>
                <h2>读取提示词文件时出错</h2>
                <p class="error">${error}</p>
            </body>
            </html>`;
    }
    getWebviewContent(content) {
        // 处理markdown内容，特别处理以"-"开头的行作为提示词
        const lines = content.split('\n');
        let processedContent = '';
        let currentPrompt = '';
        let inPrompt = false;
        let promptId = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 检测以"-"开头的行作为新提示词的开始
            if (line.trim().startsWith('-')) {
                // 如果已经在处理一个提示词，先结束它
                if (inPrompt) {
                    processedContent += `<div class="prompt-item" id="prompt-${promptId}">
                        <div class="prompt-content">${currentPrompt}</div>
                        <button class="copy-btn" data-prompt-id="${promptId}">复制</button>
                    </div>`;
                }
                // 开始一个新提示词
                promptId++;
                currentPrompt = line.trim().substring(1).trim(); // 移除"-"和前导空格
                inPrompt = true;
            }
            // 如果不是以"-"开头但在提示词内，则添加到当前提示词
            else if (inPrompt && line.trim() !== '') {
                currentPrompt += '<br>' + line;
            }
            // 如果是空行且在提示词内，可能是提示词结束
            else if (inPrompt && line.trim() === '') {
                processedContent += `<div class="prompt-item" id="prompt-${promptId}">
                    <div class="prompt-content">${currentPrompt}</div>
                    <button class="copy-btn" data-prompt-id="${promptId}">复制</button>
                </div>`;
                inPrompt = false;
                currentPrompt = '';
            }
            // 不是提示词的内容，直接添加
            else if (!inPrompt) {
                // 应用基本的Markdown格式
                const formattedLine = line
                    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`([^`]+)`/g, '<code>$1</code>');
                processedContent += formattedLine + '<br>';
            }
        }
        // 处理最后一个提示词（如果有）
        if (inPrompt) {
            processedContent += `<div class="prompt-item" id="prompt-${promptId}">
                <div class="prompt-content">${currentPrompt}</div>
                <button class="copy-btn" data-prompt-id="${promptId}">复制</button>
            </div>`;
        }
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Prompt Reader</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                    }
                    .prompts-container {
                        margin-bottom: 30px;
                    }
                    h1, h2, h3 {
                        color: var(--vscode-editor-foreground);
                    }
                    pre {
                        background-color: var(--vscode-editor-background);
                        padding: 10px;
                        border-radius: 3px;
                        overflow-x: auto;
                    }
                    code {
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                    }
                    .prompt-item {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        margin-bottom: 15px;
                        padding: 12px;
                        position: relative;
                        background-color: var(--vscode-editor-background);
                    }
                    .prompt-content {
                        padding-right: 50px; /* 为复制按钮留出空间 */
                    }
                    .copy-btn {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 3px;
                        padding: 4px 8px;
                        cursor: pointer;
                    }
                    .copy-btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .copy-success {
                        background-color: var(--vscode-terminal-ansiGreen) !important;
                    }
                    .add-prompt-btn {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        padding: 12px 20px;
                        margin-bottom: 20px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        font-weight: bold;
                        font-size: 14px;
                        justify-content: center;
                        width: 100%;
                        max-width: 300px;
                        margin-left: auto;
                        margin-right: auto;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    }
                    .add-prompt-btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                        transform: translateY(-1px);
                        box-shadow: 0 3px 5px rgba(0,0,0,0.3);
                    }
                    .add-prompt-btn svg {
                        margin-right: 6px;
                        width: 18px;
                        height: 18px;
                    }
                    .modal {
                        display: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0,0,0,0.5);
                        z-index: 1000;
                        justify-content: center;
                        align-items: center;
                    }
                    .modal.show {
                        display: flex;
                    }
                    .modal-content {
                        background-color: var(--vscode-editor-background);
                        border-radius: 6px;
                        padding: 20px;
                        width: 80%;
                        max-width: 500px;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    }
                    .modal-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                    }
                    .modal-header h3 {
                        margin: 0;
                    }
                    .close-btn {
                        background: none;
                        border: none;
                        color: var(--vscode-foreground);
                        font-size: 18px;
                        cursor: pointer;
                    }
                    .close-btn:hover {
                        color: var(--vscode-errorForeground);
                    }
                    .form-group {
                        margin-bottom: 15px;
                    }
                    .form-group label {
                        display: block;
                        margin-bottom: 5px;
                    }
                    .form-group textarea {
                        width: 100%;
                        min-height: 150px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 3px;
                        padding: 8px;
                        font-family: var(--vscode-editor-font-family);
                        resize: vertical;
                    }
                    .modal-footer {
                        display: flex;
                        justify-content: center;
                        gap: 20px;
                        margin-top: 20px;
                    }
                    .cancel-btn {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        padding: 8px 16px;
                        min-width: 80px;
                    }
                    .cancel-btn:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                    .save-btn {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        padding: 10px 24px;
                        font-size: 14px;
                        font-weight: bold;
                        cursor: pointer;
                        min-width: 100px;
                    }
                    .save-btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .section-header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .section-header h2 {
                        margin: 0;
                        flex-grow: 1;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="section-header">
                        <h2>提示词列表</h2>
                    </div>
                    
                    <button class="add-prompt-btn" id="addPromptBtn">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
                        </svg>
                        添加提示词
                    </button>
                    
                    <div class="prompts-container">
                        ${processedContent}
                    </div>
                </div>

                <!-- 添加提示词的模态框 -->
                <div id="addPromptModal" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>添加新提示词</h3>
                            <button class="close-btn" id="closeModalBtn">&times;</button>
                        </div>
                        <div class="form-group">
                            <label for="promptContent">提示词内容:</label>
                            <textarea id="promptContent" placeholder="请输入提示词内容..."></textarea>
                        </div>
                        <div class="modal-footer">
                            <button class="cancel-btn" id="cancelBtn">取消</button>
                            <button class="save-btn" id="savePromptBtn">保存提示词</button>
                        </div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // 复制按钮点击事件
                    document.querySelectorAll('.copy-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const promptId = e.target.getAttribute('data-prompt-id');
                            const promptElement = document.getElementById('prompt-' + promptId);
                            const promptContent = promptElement.querySelector('.prompt-content').innerText;
                            
                            // 使用 Clipboard API 复制文本
                            navigator.clipboard.writeText(promptContent).then(() => {
                                // 复制成功的视觉反馈
                                e.target.classList.add('copy-success');
                                e.target.textContent = '已复制';
                                
                                // 1.5秒后恢复按钮状态
                                setTimeout(() => {
                                    e.target.classList.remove('copy-success');
                                    e.target.textContent = '复制';
                                }, 1500);
                                
                                // 通知 VS Code
                                vscode.postMessage({
                                    command: 'promptCopied'
                                });
                            }).catch(err => {
                                console.error('复制失败:', err);
                            });
                        });
                    });
                    
                    // 添加提示词相关事件
                    const modal = document.getElementById('addPromptModal');
                    const addBtn = document.getElementById('addPromptBtn');
                    const closeBtn = document.getElementById('closeModalBtn');
                    const cancelBtn = document.getElementById('cancelBtn');
                    const saveBtn = document.getElementById('savePromptBtn');
                    const promptTextarea = document.getElementById('promptContent');
                    
                    // 打开模态框
                    addBtn.addEventListener('click', () => {
                        modal.classList.add('show');
                        promptTextarea.focus();
                    });
                    
                    // 关闭模态框的函数
                    function closeModal() {
                        modal.classList.remove('show');
                        promptTextarea.value = '';
                    }
                    
                    // 关闭模态框的事件
                    closeBtn.addEventListener('click', closeModal);
                    cancelBtn.addEventListener('click', closeModal);
                    
                    // 保存提示词
                    saveBtn.addEventListener('click', () => {
                        const content = promptTextarea.value.trim();
                        if (content) {
                            vscode.postMessage({
                                command: 'savePrompt',
                                content: content
                            });
                            closeModal();
                        }
                    });
                    
                    // 按ESC键关闭模态框
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && modal.classList.contains('show')) {
                            closeModal();
                        }
                    });
                </script>
            </body>
            </html>`;
    }
    // 保存提示词到文件
    async savePromptToFile(content) {
        const config = vscode.workspace.getConfiguration('promptReader');
        const promptsPath = config.get('promptsPath');
        if (!promptsPath) {
            throw new Error('未设置提示词文件路径');
        }
        try {
            // 读取当前文件内容
            let fileContent = '';
            try {
                fileContent = fs.readFileSync(promptsPath, 'utf8');
            }
            catch (error) {
                // 文件可能不存在，创建新文件
                console.error('读取文件失败，将创建新文件:', error);
            }
            // 格式化新的提示词内容 (确保以"-"开头)
            let formattedPrompt = content;
            if (!formattedPrompt.trim().startsWith('-')) {
                formattedPrompt = '- ' + formattedPrompt;
            }
            // 添加到文件末尾，确保有空行分隔
            if (fileContent && !fileContent.endsWith('\n\n')) {
                if (fileContent.endsWith('\n')) {
                    fileContent += '\n';
                }
                else {
                    fileContent += '\n\n';
                }
            }
            // 写入文件
            fs.writeFileSync(promptsPath, fileContent + formattedPrompt + '\n\n', 'utf8');
            // 更新视图
            this.updateContent();
        }
        catch (error) {
            console.error('保存提示词时出错:', error);
            throw error;
        }
    }
}
PromptReaderViewProvider.viewType = 'promptReaderView';
function activate(context) {
    // 在控制台输出调试信息
    console.log('插件 "prompt-reader" 已激活');
    vscode.window.showInformationMessage('提示词阅读器已启动');
    // Register WebView Provider
    const provider = new PromptReaderViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(PromptReaderViewProvider.viewType, provider));
    // 监听配置变化
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('promptReader.promptsPath')) {
            provider.updateFileWatcher();
            provider.updateContent();
        }
    }));
    // Command to set prompts file path
    let setPathDisposable = vscode.commands.registerCommand('prompt-reader.setPromptsPath', async () => {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Markdown': ['md']
            }
        });
        if (result && result.length > 0) {
            const config = vscode.workspace.getConfiguration('promptReader');
            await config.update('promptsPath', result[0].fsPath, true);
            vscode.window.showInformationMessage('提示词文件路径已更新');
            // 配置更新后会触发 onDidChangeConfiguration 事件，不需要在这里手动调用
        }
    });
    // Command to refresh view
    let refreshDisposable = vscode.commands.registerCommand('prompt-reader.refreshView', () => {
        provider.updateContent();
    });
    // Command to add new prompt
    let addPromptDisposable = vscode.commands.registerCommand('prompt-reader.addPrompt', async () => {
        // 检查是否设置了提示词文件路径
        const config = vscode.workspace.getConfiguration('promptReader');
        let promptsPath = config.get('promptsPath');
        if (!promptsPath) {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Markdown': ['md']
                }
            });
            if (!result || result.length === 0) {
                vscode.window.showErrorMessage('未选择提示词文件');
                return;
            }
            promptsPath = result[0].fsPath;
            await config.update('promptsPath', promptsPath, true);
        }
        // 弹出输入框让用户输入提示词
        const promptContent = await vscode.window.showInputBox({
            prompt: '请输入新的提示词',
            placeHolder: '输入提示词内容...',
            ignoreFocusOut: true
        });
        if (promptContent) {
            try {
                // 格式化提示词，确保以"-"开头
                let formattedPrompt = promptContent;
                if (!formattedPrompt.trim().startsWith('-')) {
                    formattedPrompt = '- ' + formattedPrompt;
                }
                // 读取当前文件内容
                let fileContent = '';
                try {
                    fileContent = fs.readFileSync(promptsPath, 'utf8');
                }
                catch (error) {
                    console.error('读取文件失败，将创建新文件:', error);
                }
                // 添加到文件末尾，确保有空行分隔
                if (fileContent && !fileContent.endsWith('\n\n')) {
                    if (fileContent.endsWith('\n')) {
                        fileContent += '\n';
                    }
                    else {
                        fileContent += '\n\n';
                    }
                }
                // 写入文件
                fs.writeFileSync(promptsPath, fileContent + formattedPrompt + '\n\n', 'utf8');
                vscode.window.showInformationMessage('提示词已成功添加');
                provider.updateContent();
            }
            catch (error) {
                vscode.window.showErrorMessage(`添加提示词失败: ${error}`);
            }
        }
    });
    // Legacy command for reading prompts
    let readPromptsDisposable = vscode.commands.registerCommand('prompt-reader.readPrompts', async () => {
        const config = vscode.workspace.getConfiguration('promptReader');
        let promptsPath = config.get('promptsPath');
        if (!promptsPath) {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Markdown': ['md']
                }
            });
            if (!result || result.length === 0) {
                vscode.window.showErrorMessage('未选择提示词文件');
                return;
            }
            promptsPath = result[0].fsPath;
            await config.update('promptsPath', promptsPath, true);
        }
        try {
            const content = fs.readFileSync(promptsPath, 'utf8');
            const workspaceFiles = await getWorkspaceFiles();
            // Create a new untitled document with the prompts content
            const document = await vscode.workspace.openTextDocument({
                content: `${content}\n\n当前工作区文件:\n${workspaceFiles.join('\n')}`
            });
            await vscode.window.showTextDocument(document);
        }
        catch (error) {
            vscode.window.showErrorMessage(`读取提示词文件出错: ${error}`);
        }
    });
    context.subscriptions.push(setPathDisposable, refreshDisposable, addPromptDisposable, readPromptsDisposable);
}
async function getWorkspaceFiles() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return [];
    }
    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
    return files.map(file => path.relative(workspaceFolders[0].uri.fsPath, file.fsPath));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map