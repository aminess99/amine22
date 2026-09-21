const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { execSync } = require('child_process');
try {
  const out = execSync(ffmpeg.path + ' -filters', {encoding: 'utf8'});
  if (out.includes('ass ')) {
    console.log('ass filter is supported!');
  } else {
    console.log('ass filter NOT supported! ' + out.substring(0, 50));
  }
} catch(e) {
  console.log('error', e.message);
}
