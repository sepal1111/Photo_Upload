// script.js (全新版本)
const CLIENT_ID = '279897575373-3gtk5s6df3uf8oj3h44nccsca0aigmu0.apps.googleusercontent.com'; // 請替換成您的用戶端ID
const API_KEY = 'AIzaSyDa6Bjp1-JggYvOz_LOdeZeTfYxVfDrqBU'; // 您可以在Google Cloud Console的"憑證"頁面建立一個API金鑰
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const MAIN_FOLDER_ID = '1uNMoZWf9J89pX3lxYViTDTxYtUb4lbro'; // 請替換成您Google Drive中的主要資料夾ID

let tokenClient;
let gapiInited = false;
let gisInited = false;

const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const uploadContainer = document.getElementById('upload-container');

// 當頁面載入時，這兩個 function 會被 Google 的 script 呼叫
window.gapiLoaded = () => {
  gapi.load('client', initializeGapiClient);
};

window.gisLoaded = () => {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // callback 會在請求 token 時動態提供
  });
  gisInited = true;
  maybeEnableButtons();
};

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
  });
  gapiInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    authorizeButton.style.visibility = 'visible';
  }
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    // 登入成功
    signoutButton.style.display = 'block';
    authorizeButton.innerText = '重新整理權限';
    uploadContainer.style.display = 'block';
    await listFolders();
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    // 登出後 UI 更新
    uploadContainer.style.display = 'none';
    signoutButton.style.display = 'none';
    authorizeButton.innerText = '授權登入Google帳號';
  }
}

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
        option.text = '沒有可用的子資料夾';
        option.disabled = true;
        folderSelect.appendChild(option);
    }
  } catch (err) {
    console.error("列出資料夾失敗:", err);
    alert('無法讀取資料夾清單，請確認主要資料夾ID是否正確，以及您是否有權限存取。');
  }
}

async function createFolder() {
  const newFolderName = document.getElementById('new-folder-name').value;
  if (!newFolderName) {
    alert('請輸入新資料夾名稱');
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
    alert(`資料夾 "${newFolderName}" 建立成功！`);
    document.getElementById('new-folder-name').value = '';
    await listFolders(); // 重新整理下拉列表
  } catch (err) {
    console.error("建立資料夾失敗:", err);
    alert('建立資料夾失敗。');
  }
}

function uploadFiles() {
  const files = document.getElementById('file-input').files;
  const folderId = document.getElementById('folder-select').value;
  const uploadStatus = document.getElementById('upload-status');

  if (files.length === 0) {
    alert('請選擇要上傳的檔案');
    return;
  }
  if (!folderId) {
    alert('請選擇要上傳的資料夾');
    return;
  }

  uploadStatus.innerHTML = ''; // 清空狀態

  for (const file of files) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
        const fileContent = reader.result;
        const resource = {
            'name': file.name,
            'parents': [folderId]
        };
        // 使用 multipart upload
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";
        
        const contentType = file.type || 'application/octet-stream';
        const metadata = {
            name: resource.name,
            parents: resource.parents,
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
            'headers': {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            'body': multipartRequestBody
        });
        
        request.execute(function(file) {
            console.log(file);
            uploadStatus.innerHTML += `<p>✅ ${file.name} 上傳成功！</p>`;
        });
    };
  }
}

// 綁定按鈕事件
authorizeButton.onclick = handleAuthClick;
signoutButton.onclick = handleSignoutClick;
document.getElementById('create-folder-button').onclick = createFolder;
document.getElementById('upload-button').onclick = uploadFiles;

// 在 HTML script 標籤中加入 onload="gapiLoaded()" 和 onreadystatechange="gisLoaded()"
// 由於我們使用 async defer，所以需要讓 script 載入後主動呼叫我們的 function
// 在 script 標籤中加入 `src="...js?onload=gapiLoaded"` 是一種方式
// 但我們改用 window function 的方式，更乾淨
const scriptGis = document.createElement('script');
scriptGis.src = 'https://apis.google.com/js/api.js';
scriptGis.async = true;
scriptGis.defer = true;
scriptGis.onload = () => gapiLoaded();
document.body.appendChild(scriptGis);

const scriptApi = document.createElement('script');
scriptApi.src = 'https://accounts.google.com/gsi/client';
scriptApi.async = true;
scriptApi.defer = true;
scriptApi.onload = () => gisLoaded();
document.body.appendChild(scriptApi);