// --- 請務必填寫以下三個變數 ---
const CLIENT_ID = '279897575373-3gtk5s6df3uf8oj3h44nccsca0aigmu0.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDa6Bjp1-JggYvOz_LOdeZeTfYxVfDrqBU'; 
const MAIN_FOLDER_ID = '1uNMoZWf9J89pX3lxYViTDTxYtUb4lbro';

// --- 全域變數與 DOM 元素 ---
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient;
let gapiInited = false;
let gisInited = false;

// 取得操作介面的主要區塊
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const step1Auth = document.getElementById('step-1-auth');
const step2Upload = document.getElementById('step-2-upload');
const step3Status = document.getElementById('step-3-status');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const uploadButton = document.getElementById('upload-button');

/**
 * 當 Google API Client 函式庫載入完成時會被呼叫 (由 HTML onload 觸發)
 */
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

/**
 * 當 Google Identity Services (GIS) 函式庫載入完成時會被呼叫 (由 HTML onload 觸發)
 */
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // callback 會在請求 token 時動態提供
  });
  gisInited = true;
  maybeEnableButtons();
}

/**
 * 初始化 GAPI client
 */
async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
  });
  gapiInited = true;
  maybeEnableButtons();
}

/**
 * 確保 GAPI 和 GIS 都初始化後，才顯示登入按鈕
 */
function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    authorizeButton.style.visibility = 'visible';
  }
}

/**
 * 處理授權按鈕的點擊事件
 */
function handleAuthClick() {
  // 安全檢查：確保 tokenClient 已被初始化
  if (!tokenClient) {
      console.error("Auth client is not ready yet.");
      alert("頁面正在初始化，請稍候再試...");
      return;
  }

  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    // 登入成功後更新 UI
    signoutButton.classList.remove('hidden');
    step1Auth.classList.add('hidden');
    step2Upload.classList.remove('hidden');
    await listFolders();
  };

  if (gapi.client.getToken() === null) {
    // 如果使用者尚未登入，彈出同意視窗
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // 如果使用者已登入，靜默刷新 token
    tokenClient.requestAccessToken({prompt: ''});
  }
}

/**
 * 處理登出按鈕的點擊事件
 */
function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    // 登出後重置 UI
    signoutButton.classList.add('hidden');
    step1Auth.classList.remove('hidden');
    step2Upload.classList.add('hidden');
    step3Status.classList.add('hidden');
    fileList.innerHTML = '';
    uploadButton.disabled = true;
  }
}

/**
 * 列出主要資料夾下的子資料夾，並更新下拉選單
 */
async function listFolders() {
  try {
    const response = await gapi.client.drive.files.list({
      q: `'${MAIN_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
    });
    const folders = response.result.files;
    const folderSelect = document.getElementById('folder-select');
    folderSelect.innerHTML = ''; // 清空舊選項
    if (folders && folders.length > 0) {
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.text = folder.name;
        folderSelect.appendChild(option);
      });
    } else {
        const option = document.createElement('option');
        option.text = '沒有可用的子相簿';
        option.disabled = true;
        folderSelect.appendChild(option);
    }
  } catch (err) {
    console.error("列出資料夾失敗:", err);
    alert('無法讀取相簿清單，請確認主要資料夾ID是否正確，以及您是否有權限存取。');
  }
}

/**
 * 建立新的子資料夾
 */
async function createFolder() {
  const newFolderName = document.getElementById('new-folder-name').value;
  if (!newFolderName) {
    alert('請輸入新相簿的名稱');
    return;
  }
  try {
    const response = await gapi.client.drive.files.create({
      resource: {
        name: newFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [MAIN_FOLDER_ID]
      },
      fields: 'id'
    });
    alert(`相簿 "${newFolderName}" 建立成功！`);
    document.getElementById('new-folder-name').value = '';
    await listFolders(); // 重新整理下拉列表
  } catch (err) {
    console.error("建立資料夾失敗:", err);
    alert('建立相簿失敗。');
  }
}

/**
 * 上傳使用者選擇的檔案
 */
function uploadFiles() {
  const files = fileInput.files;
  const folderId = document.getElementById('folder-select').value;
  
  if (files.length === 0) {
    alert('請先選擇要上傳的照片');
    return;
  }
  if (!folderId || document.getElementById('folder-select').disabled) {
    alert('請選擇要上傳到的相簿');
    return;
  }

  // 更新 UI 至上傳狀態
  step2Upload.classList.add('hidden');
  step3Status.classList.remove('hidden');
  const uploadStatus = document.getElementById('upload-status');
  uploadStatus.innerHTML = ''; // 清空舊狀態

  // 迭代處理每個檔案
  for (const file of files) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
        const fileContent = reader.result;
        
        // 使用 multipart upload 格式
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r_n";
        const close_delim = "\r\n--" + boundary + "--";
        
        const contentType = file.type || 'application/octet-stream';
        const metadata = {
            name: file.name,
            parents: [folderId],
            mimeType: contentType
        };

        // 將檔案內容編碼為 base64
        const base64Data = btoa(new Uint8Array(fileContent).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        
        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + contentType + '\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            base64Data +
            close_delim;
        
        const request = gapi.client.request({
            'path': '/upload/drive/v3/files',
            'method': 'POST',
            'params': {'uploadType': 'multipart'},
            'headers': {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            'body': multipartRequestBody
        });
        
        request.execute(function(file) {
            console.log(file);
            uploadStatus.innerHTML += `<p class="status-success"><i class="fa-solid fa-check-circle"></i> ${file.name} 上傳成功！</p>`;
        });
    };
  }
}

// --- 事件監聽器綁定 ---

// 監聽檔案選擇的變化
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        fileList.innerHTML = ''; // 清空舊列表
        for (const file of fileInput.files) {
            fileList.innerHTML += `<p><i class="fa-solid fa-image"></i> ${file.name}</p>`;
        }
        uploadButton.disabled = false; // 啟用上傳按鈕
    } else {
        fileList.innerHTML = '';
        uploadButton.disabled = true; // 禁用上傳按鈕
    }
});

// 將函式綁定到按鈕的點擊事件
authorizeButton.onclick = handleAuthClick;
signoutButton.onclick = handleSignoutClick;
document.getElementById('create-folder-button').onclick = createFolder;
uploadButton.onclick = uploadFiles;