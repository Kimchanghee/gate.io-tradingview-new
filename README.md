# AI Studio Gemini App Proxy Server

This nodejs proxy server lets you run your AI Studio Gemini application unmodified, without exposing your API key in the frontend code.


## Instructions

**Prerequisites**:
- [Google Cloud SDK / gcloud CLI](https://cloud.google.com/sdk/docs/install)
- (Optional) Gemini API Key

1. Download or copy the files of your AI Studio app into this directory at the root level.
2. If your app calls the Gemini API, create a Secret for your API key:
     ```
     echo -n "${GEMINI_API_KEY}" | gcloud secrets create gemini_api_key --data-file=-
     ```

3.  Deploy to Cloud Run (optionally including API key):
    ```
    gcloud run deploy my-app --source=. --update-secrets=GEMINI_API_KEY=gemini_api_key:latest
    ```

## Persisting admin data on Google Cloud

The server keeps track of generated webhook URLs as well as the lists of pending, approved and denied users. By default this
state is written to `data/state.json` inside the container, which is ephemeral on platforms such as Cloud Run. To avoid losing
administrative data after deployments configure a Google Cloud Storage bucket and provide the following environment variables
when deploying:

- `STATE_STORAGE_BUCKET` (or `GCS_BUCKET` / `PERSISTENCE_BUCKET`): name of the bucket where the state file should live.
- `STATE_STORAGE_OBJECT` (optional): object path to use inside the bucket. Defaults to `state.json`.
- `STATE_STORAGE_PROJECT` (optional): overrides the project id if it cannot be inferred from the environment.

With these variables set the application will read and write the persistent state from Cloud Storage instead of the local file
system, so webhook URLs and user approval queues survive new deployments. The server obtains access tokens from the Google
Cloud metadata server, so ensure the Cloud Run service account has `storage.objects.get` and `storage.objects.create`
permissions on the target bucket. Local file storage continues to be used automatically when no bucket is configured, allowing
local development without additional setup.

Cloud Storage 설정은 자동으로 이루어지지 않으므로 아래 절차를 직접 진행해야 관리자 데이터가 재배포 후에도 유지됩니다.

### Google Cloud Storage 설정 단계 (한글 안내)

1. **버킷 생성** – Cloud Console의 "스토리지 → 버킷 만들기" 화면에서 버킷 이름과 리전을 정해 생성하거나, 아래처럼 gcloud CLI를 사용합니다.
   ```bash
   gcloud storage buckets create gs://YOUR_BUCKET --location=asia-northeast3
   ```
2. **서비스 계정 권한 부여** – Cloud Run 서비스가 사용하는 서비스 계정을 확인한 뒤, IAM 화면에서 해당 계정에 `Storage Object Admin` 역할(또는 `storage.objects.get`과 `storage.objects.create` 권한이 포함된 역할)을 추가합니다.
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT \
     --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
     --role="roles/storage.objectAdmin"
   ```
3. **Cloud Run 배포 시 환경 변수 지정** – 생성한 버킷 이름을 `STATE_STORAGE_BUCKET` 환경 변수로 넘깁니다. 필요한 경우 객체 이름과 프로젝트 ID도 함께 설정하세요.
   ```bash
   gcloud run deploy YOUR_SERVICE \
     --source=. \
     --set-env-vars=STATE_STORAGE_BUCKET=YOUR_BUCKET,STATE_STORAGE_OBJECT=state.json
   ```
4. **동작 확인** – 관리자 페이지에서 웹훅 또는 승인 목록을 수정한 뒤, Cloud Storage 버킷에 `state.json`이 생성·갱신되는지 확인합니다. 로그에 `[persistence] Persisting admin data to Cloud Storage bucket "버킷" as "state.json".` 메시지가 보이면 정상적으로 연결된 것입니다.

Cloud Storage 설정을 하지 않으면 서버가 자동으로 `data/state.json` 파일을 사용하므로 로컬 개발에는 추가 구성이 필요 없습니다. 다만 Cloud Run 같이 컨테이너 파일 시스템이 초기화되는 환경에서는 버킷을 반드시 설정해야 데이터가 초기화되지 않습니다.

#### 수동 설정 체크리스트
- [ ] Cloud Storage 버킷을 만들었고 이름을 기억해 두었습니다.
- [ ] Cloud Run 서비스가 사용하는 서비스 계정에 `storage.objects.get`과 `storage.objects.create` 권한이 포함된 역할을 부여했습니다.
- [ ] Cloud Run 배포 시 `STATE_STORAGE_BUCKET` (필요하면 `STATE_STORAGE_OBJECT`, `STATE_STORAGE_PROJECT`) 환경 변수를 설정했습니다.
- [ ] 새 리비전 배포 후 버킷에 `state.json` 파일이 생성·갱신되는지 확인했습니다.

#### 왜 수동 설정이 필요한가요?
- 애플리케이션은 제공된 환경 변수로만 Cloud Storage 위치를 판단합니다. 버킷 생성이나 권한 부여는 Google Cloud가 자동으로 처리하지 않으므로 직접 구성해야 합니다.
- 위 단계를 건너뛰면 컨테이너 내부 디스크(`data/state.json`)만 사용하게 되어 Cloud Run 재시작 또는 재배포 시 웹훅 URL과 승인 목록이 초기화됩니다.

#### Cloud Run 서비스 계정 권한 확인 절차
1. **서비스 계정 확인** – Cloud Run 콘솔에서 서비스를 연 뒤 "보안" 또는 "서비스 계정" 섹션에서 사용 중인 서비스 계정을 확인합니다.
2. **콘솔에서 권한 검증** – Cloud Console의 "IAM 및 관리자 → IAM" 화면에서 해당 서비스 계정을 찾아 `Storage Object Admin` 역할(또는 동일 권한을 포함한 맞춤 역할)이 등록되어 있는지 확인합니다. 없다면 "권한 부여" 버튼으로 추가하세요.
3. **gcloud CLI로 검증** – 다음 명령으로 현재 역할을 확인할 수 있습니다.
   ```bash
   gcloud projects get-iam-policy YOUR_PROJECT \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:YOUR_SERVICE_ACCOUNT" \
     --format="table(bindings.role)"
   ```
   결과에 `roles/storage.objectAdmin` 또는 필요한 권한이 포함된 다른 역할이 표시되지 않으면 아래 명령으로 추가합니다.
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT \
     --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
     --role="roles/storage.objectAdmin"
   ```

#### 배포 후 정상 동작 확인
- Cloud Run 로그에서 `[persistence]`로 시작하는 영어/한글 메시지를 확인해 현재 저장 위치와 오류 여부를 판단할 수 있습니다.
- 관리자 페이지에서 웹훅 또는 승인 목록을 변경했을 때 Cloud Storage 버킷의 `state.json` 수정 시간이 갱신되는지 확인하세요.
