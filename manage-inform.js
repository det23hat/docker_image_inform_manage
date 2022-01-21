var http = require('http');
var url = require('url');
const fs = require('fs');
const keygen = require('ssh-keygen');
const child_process = require('child_process');
const port = 5001;
var format = 'PEM';

const server = http.createServer((req, res) => {
    var urlObj = url.parse(req.url, true);
    console.log(urlObj.pathname)
    req.on('data',async (chunk) => {
      //console.log(`Data chunk available: ${chunk}`)
      if(urlObj.pathname == '/notice-change/playbook'){
        console.log("playbook update");
      }
      else if(urlObj.pathname == '/inform/2'){
        reqBody = JSON.parse(chunk);
        let host = reqBody.hostname;
        let containerInfoFilePath = '@../info/newVerImageList.json'
        // 多一個new du check（檢查是否有新的du）取得cpe中含有的du個數，與newVerImageList.json檔案中的du_latest_images陣列相比個數
        var updateContainerVer = child_process.spawn('ansible-playbook',['check-update-du-ver.yml','--extra-vars',`${containerInfoFilePath}`,'-e',`host=${host}`],{ cwd:'../ansible_playbook'});
        
        updateContainerVer.stdout.on('data', function (data) {
          console.log('stdout: ' + data);
          console.log('DU版本更新完成');
        });

        updateContainerVer.stderr.on('data', function (data) {
          console.log('stderr: ' + data);
          console.log('DU版本更新失敗');
        });

        res.end();

      }else if (urlObj.pathname == '/inform/1'){
        reqBody = JSON.parse(chunk);
        let mac = reqBody.host_mac_addr;
        let host = reqBody.ansible_ssh_host;

        let status = await register_cpe(mac,host)

        console.log(`status = ${status}`)
        if (status == 0){
          console.log(`CPE ${mac} 註冊完成`);
          res.end();
        }else{
          console.log(`CPE ${mac} 註冊失敗`);
          res.end();
        }
      }
      
    })
})
server.listen(port)  


async function register_cpe(macAddr,ip){
  return new Promise(async (resolve,rejects) => {
    let key_dir = `../cpe_ssh_keys/${macAddr}`;
    let key_path = `../cpe_ssh_keys/${macAddr}/cpeKey`;
    //process.chdir('/cpe_ssh_keys');
    if (!fs.existsSync(key_dir)){
      fs.mkdir(key_dir,'0777',async (err) => { 
        if (err) { 
            return console.error(err); 
        }else{
          let status = await add_cpe(key_path,macAddr,ip);
          if(status == 0)
            resolve(0)
          else
            rejects(1)

        }   
      })
    }else{
      let status = await add_cpe(key_path,macAddr,ip);
      if(status == 0)
        resolve(0)
      else
        rejects(1)
    }
  });
  
}

function add_cpe(key_path,macAddr,ip){
  return new Promise((resolve,rejects) => {
    //console.log("add key")
    keygen({
      location: key_path,
      read: true,
      format: format
    },function(err, out){
        if(err) return console.log('ssh key產生失敗: '+err);
        console.log('完成產生ssh key');
        //console.log('public key: '+out.pubKey);
        let register_new_cpe_extra_vars=JSON.stringify({
          host: macAddr,
          ansible_ip: ip,
          ssh_key_path: key_path
        })
        let containerInfoFilePath = '@../info/newVerImageList.json'

        var registerNewCpe = child_process.spawn('ansible-playbook',['register-new-cpe.yml','--extra-vars',`${register_new_cpe_extra_vars}`,'--extra-vars',`${containerInfoFilePath}`],{ cwd:'../ansible_playbook'});
        
        registerNewCpe.stdout.on('data', function (data) {
          console.log('stdout: ' + data);
        });

        registerNewCpe.stderr.on('data', function (data) {
          console.log('stderr: ' + data);
        });
  
        registerNewCpe.on('exit', function (code) {
  
              if(code == 0){
                console.log(`CPE-${macAddr} 註冊成功`);
                var configNewCpe = child_process.spawn('ansible-playbook',['config-new-cpe.yml','--extra-vars',`${register_new_cpe_extra_vars}`,'--extra-vars',`${containerInfoFilePath}`],{ cwd:'../ansible_playbook'});
                  configNewCpe.stdout.on('data', function (data) {
                    console.log('stdout: ' + data);
                  });
                  configNewCpe.on('exit', function (code){
                    if(code == 0){
                      resolve(0);
                    }else{
                      console.log("cpe初始配置失敗")
                      rejects();
                    }
                  });  
              }else{
                console.log("cpe連線資訊加入失敗")
                rejects();
              }
          });
    });
  });
  
}