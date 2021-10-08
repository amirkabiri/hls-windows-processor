const { execSync, spawn, exec } = require("child_process");
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FFMPEG_PATH = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const archiver = require('archiver');


function zip(path, files){
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(path);
    const archive = archiver('zip', {zlib: { level: 9 }});

    output.on('close', () => resolve(archive));
    archive.on('error', reject);
// pipe archive data to the file
    archive.pipe(output);

    for (const file of files){
      archive.file(file, { name: getFileName(file) });
    }

    archive.finalize();
  })
}
async function mkdirIfNotExists(path, options = { recursive: true }){
  if(await exists(path)) return;
  await fs.promises.mkdir(path, options);
}
async function exists(path){
  try {
    await fs.promises.access(path);
    return true;
  }catch (e){
    return false;
  }
}
function randBytes(size = 16){
  return new Promise((resolve, reject) => {
    crypto.randomBytes(16, function(err, buffer) {
      if(err) reject(err);
      resolve(buffer);
    });
  })
}
function writeBufferToFile(file, buffer){
  return new Promise((resolve, reject) => {
    fs.open(file, 'w', function(err, fd) {
      if (err) reject(err)

      fs.write(fd, buffer, 0, buffer.length, null, function(err) {
        if (err) reject(err)
        fs.close(fd, resolve);
      });
    })
  })
}
function cmd(command){
  return new Promise((resolve, reject) => {
    const child = exec(command);
    child.on("exit", resolve);
  })
}
function getFileName(path){
  const fileName = path.split('\\');
  return fileName[fileName.length - 1];
}
function getFileExtension(path){
  const ext = path.split('.');
  return ext[ext.length - 1];
}
function log(msg, type = 'info'){
  const p = document.createElement('p');
  p.innerHTML = msg;

  if(type === 'error') p.style.color = 'red';

  document.getElementById('logs').appendChild(p)
}


window.onload = function(){
  document.getElementById('video').oninput = async function (e){
    if(!this.files.length) return;
    const { path: videoPath } = this.files[0];
    log('start');

    try {
      // get video file name and extension
      const fileName = getFileName(videoPath);
      const ext = getFileExtension(fileName);

      // FIXME create a random name for tempFolder and create the folder
      const tempFolder = /*Math.floor(Math.random() * 100000000)*/1458010002 + fileName;
      const tempFolderPath = path.join(__dirname, '.tmp', tempFolder);
      await fs.promises.mkdir(tempFolderPath, { recursive: true });

      // paths
      const tempFileName = 'source.' + ext;
      const tempFilePath = path.join(tempFolderPath, tempFileName);
      const encPath = path.join(tempFolderPath, 'enc.key');
      const encInfoPath = path.join(tempFolderPath, 'enc.keyinfo');
      const manifestPath = path.join(tempFolderPath, 'manifest.m3u8');
      const statusPath = path.join(tempFolderPath, 'status.txt');
      const zipPath = path.join(tempFolderPath, fileName + '.zip');

      // copy video to temp folder
      if(! await exists(tempFilePath)) {
        await fs.promises.copyFile(videoPath, tempFilePath);
        log('copied to ' + tempFilePath)
      } else log('didnt copied. because already exists at '+ tempFilePath);

      // generate 16 bytes enc key buffer and write to the file
      if(! await exists(encPath)) {
        const encKey = await randBytes(16);
        await writeBufferToFile(encPath, encKey);
        log('enc key created at ' + encPath);
      } else log('enc already exists at ' + encPath);

      // create enc.keyinfo file
      if(! await exists(encInfoPath)){
        const IV = (await randBytes(16)).toString('hex');
        let keyInfoFileContent = `[LINK_TO_ENC_KEY_FILE]\n` + encPath+`\n` + IV;
        await fs.promises.writeFile(encInfoPath, keyInfoFileContent);
        log('enc.keyinfo created at ' + encInfoPath)
      } else log('enc.keyinfo already exists at ' + encInfoPath)

      // run ffmpeg
      if(! await exists(manifestPath)){
        log('start conversion, heavy process, please wait ...')
        execSync([
          FFMPEG_PATH,
          '-y',
          '-i ' + tempFilePath,
          '-hls_time 9',
          '-hls_key_info_file ' + encInfoPath,
          '-hls_playlist_type vod',
          '-hls_segment_filename "'+ path.join(tempFolderPath, '%d.ts') +'"',
          manifestPath
        ].join(' '));
        log('conversion ended')
      } else log('converted files already exist')

      // write the status
      if(! await exists(statusPath)) {
        await fs.promises.writeFile(statusPath, 'finished');
        log('status generated at ' + statusPath);
      } else log('status already exists at ' + statusPath);

      // make zip file
      if(! await exists(zipPath)){
        const filesToZip = fs
          .readdirSync(tempFolderPath)
          .filter(file => file !== tempFileName)
          .map(file => path.join(tempFolderPath, file));
        await zip(zipPath, filesToZip);
        log('zip file created at ' + zipPath);
      } else log('zip file already exists at ' + zipPath);

      // copy file aside of original video
      await fs.promises.copyFile(zipPath, videoPath + '.zip');
      log('final result copied at ' + videoPath + '.zip');

      // remove tmp files
      await fs.promises.rmdir(tempFolderPath, { recursive: true })
      log('temp files cleaned')
    }catch (e){
      log(e.toString(), 'error');
    }

    log('end');
  }
}