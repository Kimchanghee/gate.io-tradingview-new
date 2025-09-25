'use strict';

/**
 * Cloud Run과 App Engine 배포 환경에서는 package.json의 `start` 스크립트를
 * 실행하므로, 기존 server-simple 진입점을 그대로 재사용할 수 있도록
 * 래퍼 파일을 제공합니다. 이 파일은 서버 부트스트랩 로직을 포함한
 * `server-simple.js`를 단순히 require하여 동일한 Express 앱을 구동합니다.
 */
require('./server-simple');
