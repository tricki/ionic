import { join } from 'path';
import { dest, src, task } from 'gulp';
import { DIST_VENDOR_ROOT, NPM_VENDOR_FILES, PROJECT_ROOT, SCRIPTS_ROOT } from '../constants';

task('test', ['test.assembleVendorJs', 'compile.karma'], (done: Function) => {
  karmaTest(false, done);
});

task('test.watch', ['test.assembleVendorJs', 'compile.karma'], (done: Function) => {
  karmaTest(true, done);
});

task('test.coverage', ['test.assembleVendorJs', 'compile.karma'], (done: Function) => {
  karmaTest(false, () => {
    createKarmaCoverageReport(done);
  });
});

task('test.imageserver', () => {
  const http = require('http');
  const url = require('url');

  const port = 8900;
  let connections = 0;

  function handleRequest(req, res) {
    const query = url.parse(req.url, true).query;
    const delay = query.delay || 2000;
    const id = query.id || Math.round(Math.random() * 1000);
    const w = query.width || 80;
    const h = query.width || 80;
    const color = query.color || 'yellow';

    connections++;

    setTimeout(() => {
      connections--;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
                  style="background-color: ${color}; width: ${w}px; height: ${h}px;">
                <text x="10" y="20">${id}</text>
              </svg>`);
    }, delay * connections);
  }

  http.createServer(handleRequest).listen(port, () => {
    console.log(`  Mock image server listening on: http://localhost:${port}/?delay=2000&id=99`);
    console.log(`  Possible querystrings:`);
    console.log(`    delay: how long it should take to respond, defaults to 2000`);
    console.log(`    id: the text to go in the svg image, defaults to random number`);
    console.log(`    w: image width, defaults to 80`);
    console.log(`    h: image height, defaults to 80`);
    console.log(`    color: image background color, defaults to yellow`);
  });

});

function karmaTest(watch: boolean, done: Function) {
  const karma = require('karma');
  const argv = require('yargs').argv;

  let karmaConfig = {
    configFile: join(SCRIPTS_ROOT, 'karma/karma.conf.js'),
  };

  if (watch) {
    (karmaConfig as any).singleRun = false;
  }

  if (argv.testGrep) {
    (<any>karmaConfig).client = {
      args: ['--grep', argv.testGrep]
    };
  }

  new karma.Server(karmaConfig, done).start();
}


task('test.assembleVendorJs', () => {
  const files = NPM_VENDOR_FILES.map((root) => {
    const glob = join(root, '**/*.+(js|js.map)');
    return src(join('node_modules', glob))
           .pipe(dest(join(DIST_VENDOR_ROOT, root)));
  });
  const gulpMerge = require('merge2');
  return gulpMerge(files);
});


/* creates a karma code coverage report */
function createKarmaCoverageReport(done: Function) {
  console.log('Generating Unit Test Coverage Report...');

  let exec = require('child_process').exec;
  let command = `node_modules/.bin/remap-istanbul -i coverage/coverage-final.json -o coverage -t html`;

  exec(command, function(err: any, stdout: any, stderr: any) {
    console.log(`file://${PROJECT_ROOT}/coverage/index.html`);
    done(err);
  });
}
