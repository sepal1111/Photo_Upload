// --- 步驟一：請務必將以下四個變數替換成您自己的資訊 ---
// 來源：Google Cloud Console -> API 和服務 -> 憑證 -> API 金鑰
const API_KEY = 'AIzaSyCxXx4cA4VkrczCqUZinzq4qSLDPtylmY0';

// 來源：Google Cloud Console -> API 和服務 -> 憑證 -> OAuth 2.0 用戶端 ID
const CLIENT_ID = '279897575373-3gtk5s6df3uf8oj3h44nccsca0aigmu0.apps.googleusercontent.com';

// 來源：Google Apps Script 部署後的網路應用程式網址
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxky0kheWf2COMntLcydmH3of_10V14QyfcWqRGTkeH2aGtGFDKRLmvylFXn14wxnAl/exec';

// 來源：您在 Google Drive 建立的主資料夾網址最後那串 ID
const ROOT_FOLDER_ID = '1uNMoZWf9J89pX3lxYViTDTxYtUb4lbro';
// --- 設定結束 ---

// 授權範圍：允許應用程式完整存取使用者的 Google Drive
const SCOPES = 'https://www.googleapis.com/auth/drive';

// --- 全域變數與 DOM 元素 ---
let tokenClient;
let gapiInited = false;
let gisInited = false;
let selectedFolderId = null;

const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const uploadForm = document.getElementById('upload-form');
const folderSelect = document.getElementById('folder-select');
const newFolderNameInput = document.getElementById('new-folder-name');
const createFolderBtn = document.getElementById('create-folder-btn');
const refreshFoldersBtn = document.getElementById('refresh-folders');
const fileInput = document.getElementById('file-input');
const uploadButton = document.getElementById('upload-button');
const statusDiv = document.getElementById('status');
const currentFolderNameSpan = document.getElementById('current-folder-name');

// --- 初始化函式 ---

// 當 GAPI (Google API) Client 程式庫載入完成時觸發
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

// 當 GIS (Google Identity Services) 程式庫載入完成時觸發
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 會在請求時動態設定回呼函式
    });
    gisInited = true;
    checkReadyState();
}

// 初始化 GAPI Client
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;
    checkReadyState();
}

// 檢查兩個程式庫是否都已載入完成，若完成則啟用登入按鈕
function checkReadyState() {
    if (gapiInited && gisInited) {
        authorizeButton.disabled = false;
    }
}


// --- 授權與登入/登出處理 ---

// 處理點擊登入按鈕的事件
authorizeButton.onclick = function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        // 登入成功，切換 UI 顯示
        signoutButton.style.display = 'block';
        uploadForm.style.display = 'block';
        authorizeButton.style.display = 'none';
        
        // 載入資料夾列表
        statusDiv.textContent = '登入成功！正在讀取相簿列表...';
        await listFolders();
    };

    // 如果 gapi.client 中沒有 token，則請求新的；否則刷新現有的 token
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
};

// 處理點擊登出按鈕的事件
signoutButton.onclick = function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            // 切換 UI 顯示
            authorizeButton.style.display = 'block';
            signoutButton.style.display = 'none';
            uploadForm.style.display = 'none';
            // 重設狀態
            statusDiv.textContent = '您已成功登出。';
            fileInput.value = '';
            folderSelect.innerHTML = '';
            selectedFolderId = null;
            updateUploadButtonStatus();
        });
    }
};


// --- Google Drive API 互動函式 ---

// 列出根目錄下的子資料夾
async function listFolders() {
    statusDiv.textContent = '正在讀取相簿列表...';
    folderSelect.innerHTML = '<option value="">請選擇或建立一個相簿...</option>';
    try {
        const response = await gapi.client.drive.files.list({
            q: `'${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            orderBy: 'name',
        });
        const folders = response.result.files;
        if (folders && folders.length > 0) {
            folders.forEach(folder => {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.name;
                folderSelect.appendChild(option);
            });
            statusDiv.textContent = '相簿列表讀取完成，請選擇相簿以上傳照片。';
        } else {
            statusDiv.textContent = '根目錄中沒有找到任何相簿，請建立一個新的。';
        }
    } catch (err) {
        console.error("讀取資料夾時發生錯誤:", err);
        const errorDetails = err.result ? err.result.error.message : '請檢查瀏覽器主控台以獲取詳細資訊。';
        statusDiv.textContent = `讀取相簿失敗: ${errorDetails}`;
    }
}

// 建立新資料夾
createFolderBtn.onclick = async () => {
    const folderName = newFolderNameInput.value.trim();
    if (!folderName) {
        alert('請輸入新相簿的名稱！');
        return;
    }
    createFolderBtn.disabled = true;
    statusDiv.textContent = `正在建立相簿 "${folderName}"...`;
    
    try {
        const response = await gapi.client.drive.files.create({
            resource: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [ROOT_FOLDER_ID]
            },
            fields: 'id, name'
        });
        const newFolder = response.result;
        statusDiv.textContent = `✅ 相簿 "${newFolder.name}" 建立成功！`;
        
        // 將新建立的資料夾擁有權轉移給您自己
        await changeOwner(newFolder.id, `資料夾 "${newFolder.name}"`);

        // 刷新列表並自動選中
        await listFolders();
        folderSelect.value = newFolder.id;
        updateSelectedFolder();
        newFolderNameInput.value = '';

    } catch (err) {
        console.error("建立資料夾時發生錯誤:", err);
        const errorDetails = err.result ? err.result.error.message : '請檢查主控台。';
        statusDiv.textContent = `建立相簿失敗: ${errorDetails}`;
    } finally {
        createFolderBtn.disabled = false;
    }
};

// 上傳檔案
uploadButton.onclick = async () => {
    const files = fileInput.files;
    if (files.length === 0) {
        alert('請選擇要上傳的檔案！');
        return;
    }
    uploadButton.disabled = true;
    statusDiv.innerHTML = '';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const metadata = {
            name: file.name,
            parents: [selectedFolderId]
        };
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        statusDiv.innerHTML += `[${i+1}/${files.length}] 正在上傳 ${file.name}...\n`;

        try {
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': `Bearer ${gapi.client.getToken().access_token}` }),
                body: formData,
            });
            const result = await response.json();
            
            if (result.error) throw new Error(result.error.message);
            
            statusDiv.innerHTML += `  -> ✅ 上傳成功！\n`;
            await changeOwner(result.id, file.name);

        } catch (err) {
            console.error(err);
            statusDiv.innerHTML += `  -> ❌ 上傳失敗: ${err.message}\n`;
        }
    }
    
    statusDiv.innerHTML += '\n------ 所有檔案處理完畢 ------';
    fileInput.value = ''; 
    uploadButton.disabled = false;
    updateUploadButtonStatus();
};


// --- 後端 Apps Script 互動 ---

// 呼叫 Apps Script Web App 來轉移檔案或資料夾的擁有者
async function changeOwner(id, name) {
    statusDiv.innerHTML += `  -> 正在轉移 ${name} 的擁有權...`;
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: id }),
            redirect: "follow"
        });
        
        if (!response.ok) {
            throw new Error(`伺服器回應錯誤: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.status === 'success') {
            statusDiv.innerHTML += ` ✅ 成功！\n`;
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error("轉移擁有權時發生錯誤:", err);
        statusDiv.innerHTML += ` ❌ 失敗: ${err.message}\n`;
    }
}


// --- UI 更新與事件監聽 ---

refreshFoldersBtn.onclick = listFolders;
folderSelect.onchange = updateSelectedFolder;
fileInput.onchange = updateUploadButtonStatus;

// 當選擇的資料夾變更時，更新 UI
function updateSelectedFolder() {
    selectedFolderId = folderSelect.value;
    if (selectedFolderId) {
        const selectedOption = folderSelect.options[folderSelect.selectedIndex];
        currentFolderNameSpan.textContent = selectedOption.textContent;
    } else {
        currentFolderNameSpan.textContent = '尚未選擇';
    }
    updateUploadButtonStatus();
}

// 根據是否已選擇資料夾和檔案，更新上傳按鈕的狀態
function updateUploadButtonStatus() {
    const folderIsSelected = !!selectedFolderId;
    const filesAreSelected = fileInput.files.length > 0;
    
    fileInput.disabled = !folderIsSelected;
    uploadButton.disabled = !(folderIsSelected && filesAreSelected);
}
