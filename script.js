const CLIENT_ID = '279897575373-3gtk5s6df3uf8oj3h44nccsca0aigmu0.apps.googleusercontent.com'; // 請替換成您的用戶端ID
const API_KEY = 'AIzaSyDa6Bjp1-JggYvOz_LOdeZeTfYxVfDrqBU'; // 您可以在Google Cloud Console的"憑證"頁面建立一個API金鑰
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const uploadContainer = document.getElementById('upload-container');

function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(function () {
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
    });
}

function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        uploadContainer.style.display = 'block';
        listFolders();
    } else {
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        uploadContainer.style.display = 'none';
    }
}

function handleAuthClick(event) {
    gapi.auth2.getAuthInstance().signIn();
}

function handleSignoutClick(event) {
    gapi.auth2.getAuthInstance().signOut();
}

const createFolderButton = document.getElementById('create-folder-button');
createFolderButton.onclick = createFolder;

function createFolder() {
    const newFolderName = document.getElementById('new-folder-name').value;
    if (!newFolderName) {
        alert('請輸入新資料夾名稱');
        return;
    }

    const fileMetadata = {
        'name': newFolderName,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': ['1uNMoZWf9J89pX3lxYViTDTxYtUb4lbro'] // 請替換成您Google Drive中的主要資料夾ID
    };

    gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    }).then(function(response) {
        switch (response.status) {
            case 200:
                alert('資料夾建立成功！');
                listFolders();
                break;
            default:
                alert('建立資料夾失敗: ' + response.body);
                break;
        }
    });
}


const uploadButton = document.getElementById('upload-button');
uploadButton.onclick = uploadFiles;

function listFolders() {
    gapi.client.drive.files.list({
        'q': "'YOUR_MAIN_FOLDER_ID' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        'fields': "nextPageToken, files(id, name)"
    }).then(function(response) {
        const folders = response.result.files;
        const folderSelect = document.getElementById('folder-select');
        folderSelect.innerHTML = '';
        if (folders && folders.length > 0) {
            for (let i = 0; i < folders.length; i++) {
                const folder = folders[i];
                const option = document.createElement('option');
                option.value = folder.id;
                option.text = folder.name;
                folderSelect.appendChild(option);
            }
        }
    });
}

function uploadFiles() {
    const files = document.getElementById('file-input').files;
    if (files.length === 0) {
        alert('請選擇要上傳的檔案');
        return;
    }

    const folderId = document.getElementById('folder-select').value;
    if (!folderId) {
        alert('請選擇要上傳的資料夾');
        return;
    }

    const uploadStatus = document.getElementById('upload-status');
    uploadStatus.innerHTML = '上傳中...';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const metadata = {
            'name': file.name,
            'parents': [folderId]
        };

        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = function(e) {
            const contentType = file.type || 'application/octet-stream';
            const request = gapi.client.request({
                'path': '/upload/drive/v3/files',
                'method': 'POST',
                'params': {'uploadType': 'multipart'},
                'headers': {
                    'Content-Type': 'multipart/related; boundary="foo_bar_baz"'
                },
                'body': 
                    '--foo_bar_baz\r\n' +
                    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                    JSON.stringify(metadata) + '\r\n' +
                    '--foo_bar_baz\r\n' +
                    'Content-Type: ' + contentType + '\r\n' +
                    'Content-Transfer-Encoding: base64\r\n\r\n' +
                    btoa(String.fromCharCode.apply(null, new Uint8Array(e.target.result))) + '\r\n' +
                    '--foo_bar_baz--'
            });
            request.execute(function(file) {
                console.log(file);
                uploadStatus.innerHTML += `<p>${file.name} 上傳成功！</p>`;
            });
        };
    }
}
handleClientLoad();