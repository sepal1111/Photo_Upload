// --- 請務必填寫以下三個變數 ---
const CLIENT_ID = '279897575373-3gtk5s6df3uf8oj3h44nccsca0aigmu0.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDa6Bjp1-JggYvOz_LOdeZeTfYxVfDrqBU'; 
const MAIN_FOLDER_ID = '1uNMoZWf9J89pX3lxYViTDTxYtUb4lbro';

// --- 全域變數與 DOM 元素 ---
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.readonly';
let tokenClient;
let gapiInited = false;
let gisInited = false;

// 取得操作介面的主要區塊
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const step1Auth = document.getElementById('step-1-auth');
const step2Upload = document.getElementById('step-2-upload');
const step3Status = document.getElementById('step-3-status');
const step4Viewer = document.getElementById('step-4-viewer');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const uploadButton = document.getElementById('upload-button');
const loader = document.getElementById('loader');
const browseButton = document.getElementById('browse-button');
const photoGrid = document.getElementById('photo-grid');
const backToUploadButton = document.getElementById('back-to-upload-button');

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
 * 確保 GAPI 和 GIS 都初始化後，才啟用登入按鈕並隱藏載入提示
 */
function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    loader.classList.add('hidden'); // 隱藏載入提示
    authorizeButton.disabled = false; // 啟用按鈕
  }
}

/**
 * 處理授權按鈕的點擊事件
 */
function handleAuthClick() {
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
    gapi.client.setToken(null);
    // 登出後重置 UI
    signoutButton.classList.add('hidden');
    step1Auth.classList.remove('hidden');
    step2Upload.classList.add('hidden');
    step3Status.classList.add('hidden');
    step4Viewer.classList.add('hidden'); // 確保瀏覽器也隱藏
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
      folderSelect.disabled = false;
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.text = folder.name;
        folderSelect.appendChild(option);
      });
    } else {
        const option = document.createElement('option');
        option.text = '沒有可用的子相簿';
        folderSelect.disabled = true;
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

  step2Upload.classList.add('hidden');
  step3Status.classList.remove('hidden');
  const uploadStatus = document.getElementById('upload-status');
  uploadStatus.innerHTML = ''; 

  let uploadedCount = 0;
  const totalFiles = files.length;

  for (const file of files) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
        const fileContent = reader.result;
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";
        const contentType = file.type || 'application/octet-stream';
        const metadata = {
            name: file.name,
            parents: [folderId],
            mimeType: contentType
        };
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
            'headers': {'Content-Type': 'multipart/related; boundary="' + boundary + '"'},
            'body': multipartRequestBody
        });
        
        request.execute(function(file, rawResponse) {
            uploadedCount++;
            if (!file || file.error) {
                console.error("上傳失敗:", file.error, rawResponse);
                uploadStatus.innerHTML += `<p class="status-error"><i class="fa-solid fa-times-circle"></i> ${metadata.name} 上傳失敗。</p>`;
            } else {
                console.log(file);
                uploadStatus.innerHTML += `<p class="status-success"><i class="fa-solid fa-check-circle"></i> ${file.name} 上傳成功！</p>`;
            }
            if (uploadedCount === totalFiles) {
                uploadStatus.innerHTML += `<p><strong>所有檔案處理完畢！3秒後將返回上傳頁面...</strong></p>`;
                setTimeout(() => {
                    step3Status.classList.add('hidden');
                    step2Upload.classList.remove('hidden');
                    fileInput.value = '';
                    fileList.innerHTML = '';
                    uploadButton.disabled = true;
                }, 3000);
            }
        });
    };
  }
}

/**
 * 處理瀏覽按鈕的點擊事件
 */
function handleBrowseClick() {
    const folderSelect = document.getElementById('folder-select');
    const folderId = folderSelect.value;
    if (!folderId || folderSelect.disabled) {
        alert('請先選擇一個相簿來瀏覽');
        return;
    }
    step2Upload.classList.add('hidden');
    step4Viewer.classList.remove('hidden');
    displayPhotos(folderId);
}

/**
 * 獲取並顯示指定資料夾中的照片
 * @param {string} folderId The ID of the folder to browse.
 */
async function displayPhotos(folderId) {
    photoGrid.innerHTML = `<div class="photo-grid-message"><i class="fa-solid fa-spinner fa-spin"></i> 正在載入照片...</div>`;
    try {
        const response = await gapi.client.drive.files.list({
            q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
            fields: "files(id, name, thumbnailLink, webViewLink)",
            pageSize: 100
        });
        const files = response.result.files;
        if (!files || files.length === 0) {
            photoGrid.innerHTML = `<div class="photo-grid-message"><i class="fa-solid fa-folder-open"></i> 這個相簿沒有照片。</div>`;
            return;
        }
        let thumbnailsHTML = '';
        for (const file of files) {
            if (file.thumbnailLink) {
                thumbnailsHTML += `
                    <a href="${file.webViewLink}" target="_blank" class="thumbnail" title="${file.name}">
                        <img src="${file.thumbnailLink.replace('=s220', '=s400')}" alt="${file.name}" loading="lazy">
                    </a>
                `;
            }
        }
        photoGrid.innerHTML = thumbnailsHTML;
    } catch (err) {
        console.error("載入照片失敗:", err);
        photoGrid.innerHTML = `<div class="photo-grid-message"><i class="fa-solid fa-exclamation-triangle"></i> 載入照片失敗。</div>`;
        alert('載入照片失敗，請稍後再試。');
    }
}

/**
 * 處理返回按鈕的點擊事件
 */
function handleBackToUploadClick() {
    step4Viewer.classList.add('hidden');
    step2Upload.classList.remove('hidden');
    photoGrid.innerHTML = ''; // 清空照片，節省記憶體
}


// --- 事件監聽器綁定 ---

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        const fileItems = [];
        for (const file of fileInput.files) {
            fileItems.push(`<p><i class="fa-solid fa-image"></i> ${file.name}</p>`);
        }
        fileList.innerHTML = fileItems.join('');
        uploadButton.disabled = false;
    } else {
        fileList.innerHTML = '';
        uploadButton.disabled = true;
    }
});

authorizeButton.onclick = handleAuthClick;
signoutButton.onclick = handleSignoutClick;
document.getElementById('create-folder-button').onclick = createFolder;
uploadButton.onclick = uploadFiles;
browseButton.onclick = handleBrowseClick;
backToUploadButton.onclick = handleBackToUploadClick;


