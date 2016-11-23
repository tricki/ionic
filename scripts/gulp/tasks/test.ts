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

  function handleRequest(req: any, res: any) {
    const query = url.parse(req.url, true).query;

    const delay = query.delay || 2000;
    const id = query.id ||
     Math.round(Math.random() * 1000);

    setTimeout(() => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
                      style="background-color: yellow; width: 80px; height: 80px;">
                    <text x="20" y="30">${id}</text>
                  </svg>`;

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(svg);
    }, delay);
  }

  http.createServer(handleRequest).listen(port, () => {
    console.log(`  Mock image server listening on: http://localhost:${port}/?delay=2000&id=99`);
    console.log(`  Add a "delay" querystring to delay its response`);
    console.log(`  Add an "id" querystring so the id goes in the image`);
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
