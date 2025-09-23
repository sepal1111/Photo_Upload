// --- 請修改以下四個變數 ---
const API_KEY = 'YOUR_API_KEY'; // 暂时用不到，但建议保留
const CLIENT_ID = '279897575373-3gtk5s6df3uf8oj3h44nccsca0aigmu0.apps.googleusercontent.com'; // 來自 Google Cloud Console
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx1W-iD3eo-RSaFnAIhZ_5G_QB1hF9p3q5ToQtfL8OIKcldb75h2vBP-D3JCqAqe111/exec'; // 來自 Apps Script 部署
const ROOT_FOLDER_ID = '1yR8pE1Pz7hNwJ9d-srxwrE6zsjh_GsHY'; // 你的 Google Drive 根資料夾 ID
// --- 修改結束 ---

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

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

// 當 GAPI Client 載入完成時觸發
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

// 當 Google Sign-In (GIS) 載入完成時觸發
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 會在請求時動態設定
    });
    gisInited = true;
    maybeEnableButtons();
}

async function initializeGapiClient() {
    await gapi.client.init({
        // API Key 暫時不需要，因為所有操作都透過 OAuth 進行
        // apiKey: API_KEY, 
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        authorizeButton.disabled = false;
    }
}

authorizeButton.onclick = handleAuthClick;
signoutButton.onclick = handleSignoutClick;

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        // 登入成功
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('upload-form').style.display = 'block';
        signoutButton.style.display = 'block';

        // 載入資料夾列表
        await listFolders();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('upload-form').style.display = 'none';
        signoutButton.style.display = 'none';
        statusDiv.textContent = '您已登出。';
        fileInput.value = '';
        folderSelect.innerHTML = '';
        selectedFolderId = null;
        updateUploadButtonStatus();
    }
}

// 列出根目錄下的子資料夾
async function listFolders() {
    statusDiv.textContent = '正在讀取相簿列表...';
    folderSelect.innerHTML = '<option value="">請選擇一個相簿...</option>';
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
        }
        statusDiv.textContent = '相簿列表讀取完成。';
    } catch (err) {
        console.error(err);
        statusDiv.textContent = `讀取相簿失敗: ${err.message}`;
    }
}

refreshFoldersBtn.onclick = listFolders;

// 建立新資料夾
createFolderBtn.onclick = async () => {
    const folderName = newFolderNameInput.value.trim();
    if (!folderName) {
        alert('請輸入新相簿的名稱！');
        return;
    }
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
        statusDiv.textContent = `相簿 "${newFolder.name}" 建立成功！`;
        newFolderNameInput.value = '';
        await listFolders();
        // 自動選擇新建的資料夾
        folderSelect.value = newFolder.id;
        updateSelectedFolder();
    } catch (err) {
        console.error(err);
        statusDiv.textContent = `建立相簿失敗: ${err.message}`;
    }
};

folderSelect.onchange = updateSelectedFolder;

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

fileInput.onchange = updateUploadButtonStatus;

function updateUploadButtonStatus() {
    if (selectedFolderId && fileInput.files.length > 0) {
        uploadButton.disabled = false;
        fileInput.disabled = false;
    } else {
        uploadButton.disabled = true;
        fileInput.disabled = !selectedFolderId;
    }
}

// 上傳檔案
uploadButton.onclick = async () => {
    const files = fileInput.files;
    if (files.length === 0) {
        alert('請選擇要上傳的檔案！');
        return;
    }
    if (!selectedFolderId) {
        alert('請先選擇一個相簿！');
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

        statusDiv.innerHTML += `正在上傳 ${file.name}...<br>`;

        try {
            // 使用 Fetch API 直接上傳，這樣可以處理大檔案
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': `Bearer ${gapi.client.getToken().access_token}` }),
                body: formData,
            });
            const result = await response.json();

            if (result.error) {
                throw new Error(result.error.message);
            }

            statusDiv.innerHTML += `✅ ${file.name} 上傳成功！File ID: ${result.id}<br>`;

            // 觸發 Apps Script 轉移擁有者
            await changeOwner(result.id, file.name);

        } catch (err) {
            console.error(err);
            statusDiv.innerHTML += `❌ ${file.name} 上傳失敗: ${err.message}<br>`;
        }
    }

    fileInput.value = ''; // 清空選擇的檔案
    uploadButton.disabled = false;
};

// 呼叫 Apps Script Web App 來轉移擁有者
async function changeOwner(fileId, fileName) {
    statusDiv.innerHTML += `正在轉移 ${fileName} 的擁有權...<br>`;
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors', // 必須設定為 cors
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileId: fileId }),
        });
        const result = await response.json();
        if (result.status === 'success') {
            statusDiv.innerHTML += `🎉 ${fileName} 的擁有權已成功轉移！<br><hr>`;
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error(err);
        statusDiv.innerHTML += `⚠️ 轉移 ${fileName} 的擁有權失敗: ${err.message}<br><hr>`;
    }
}