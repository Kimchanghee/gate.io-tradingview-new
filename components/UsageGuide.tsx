import React from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

type GuideContent = {
  title: string;
  intro: string;
  siteIntroTitle: string;
  siteIntroDescription: string;
  siteHighlights?: string[];
  steps: string[];
  tips?: string[];
  apiConnectionTitle?: string;
  apiConnectionIntro?: string;
  apiConnectionSteps?: string[];
  apiConnectionNotesTitle?: string;
  apiConnectionNotes?: string[];
};

const guides: Record<string, GuideContent> = {
  ko: {
    title: '사용 가이드',
    intro: 'UID 인증과 신호 구독을 빠르게 설정하려면 아래 순서를 따라 주세요.',
    siteIntroTitle: '서비스 소개',
    siteIntroDescription:
      '이 페이지는 트레이딩뷰 지표 알림을 Gate.io 선물 계정과 연동하기 위한 사용자 포털입니다. UID 인증부터 신호 모니터링, API 연결까지 한 화면에서 처리할 수 있습니다.',
    siteHighlights: [
      'UID 기반 승인으로 검증된 사용자만 전략 신호를 수신합니다.',
      '승인 후 개인 API 키를 연결해 자동 거래와 실시간 전략 신호를 확인할 수 있습니다.',
      '관리자 콘솔에서 UID 승인, 전략 배포, 실시간 로그를 통합 관리합니다.',
    ],
    steps: [
      '상단에서 언어와 네트워크(메인넷·테스트넷)를 확인한 뒤 UID를 입력하고 UID 로그인을 실행합니다.',
      'UID 등록 버튼을 누르면 요청이 관리자에게 전달됩니다. 최대 3시간 내에 승인 안내를 드립니다.',
      '승인 후에는 API 연결과 실시간 신호 확인이 가능하며, 웹훅 전달 여부는 관리자 콘솔에서만 관리됩니다.',
    ],
    tips: [
      '사용자 화면에서는 전략이나 웹훅을 따로 선택하지 않습니다. 승인된 전략은 관리자 페이지에서 할당됩니다.',
      '다른 전략을 이용하고 싶다면 관리자에게 문의해 승인 전략을 조정해 달라고 요청하세요.',
    ],
    apiConnectionTitle: 'API 키 연결 가이드',
    apiConnectionIntro:
      'API 연결 전에 UID 로그인 카드에 표시된 접근 키가 최신인지 확인하세요. 메인넷과 테스트넷은 별개의 Gate.io 환경이므로 각 환경에 맞는 API 키로 연결해야 합니다.',
    apiConnectionSteps: [
      'UID 로그인 버튼을 눌러 접근 키(Access Key)가 화면에 표시되는지 확인합니다. 키가 보이지 않거나 만료되었다면 다시 로그인해 갱신하세요.',
      'Gate.io 본계정에서 메인넷 API 키를 생성하고 Futures 읽기/거래, 현물 조회 권한을 활성화합니다. 테스트 거래를 하려면 testnet.gateio.ws에서 별도의 테스트넷 API 키를 발급하세요.',
      '연결하려는 환경(메인넷 또는 테스트넷)을 먼저 상단 네트워크 토글에서 선택합니다.',
      '선택한 네트워크에 맞는 API Key와 Secret을 입력한 뒤 “API 연결”을 누릅니다.',
      '키와 네트워크가 맞지 않으면 시스템이 자동으로 감지해 다른 네트워크로 전환합니다. 연결 후 상태 메시지와 API 엔드포인트(https://api.gateio.ws 또는 https://fx-api-testnet.gateio.ws)를 확인해 주세요.',
    ],
    apiConnectionNotesTitle: '연결 확인 및 오류 해결',
    apiConnectionNotes: [
      '403 응답에서 uid_not_found, uid_credentials_mismatch, missing_credentials 코드가 나타나면 접근 키가 만료되었거나 승인되지 않은 상태입니다. UID 로그인 버튼을 다시 눌러 접근 키를 갱신하고 필요하면 관리자에게 재발급을 요청하세요.',
      '403 응답에서 “invalid_credentials” 코드가 보이면 Gate.io API 키 권한(Futures 읽기/거래 등)과 네트워크 짝이 올바른지 다시 확인하세요.',
      '포지션/계정 조회가 404 “no_connection”으로 나오면 아직 API 키가 저장되지 않은 상태입니다. 위 절차대로 다시 연결하거나 UID 접근 키 승인을 확인하세요.',
    ],
  },
  en: {
    title: 'Usage Guide',
    intro: 'Follow these steps to request access and receive indicator signals promptly.',
    siteIntroTitle: 'What this service offers',
    siteIntroDescription:
      'This portal links TradingView indicator alerts with Gate.io futures accounts. It centralizes UID verification, signal monitoring, and API setup for approved users.',
    siteHighlights: [
      'UID approval controls who can receive strategy signals.',
      'After approval you can plug in personal API keys to automate trades and follow live strategy updates.',
      'The admin console manages UID approvals, strategy distribution, and real-time operational logs.',
    ],
    steps: [
      'Verify the language and network (Mainnet or Testnet), then enter your UID and press “UID Login.”',
      'Hit “Register UID” to send the request to the admins. They review it within three hours and notify you once approved.',
      'After approval you can connect the API and monitor live signals. Webhook delivery is handled from the admin console.',
    ],
    tips: [
      'End users do not configure strategies or webhooks here. The admin assigns approved strategies after reviewing your request.',
      'If you need different strategies later, contact the admin team to update your approvals.',
    ],
    apiConnectionTitle: 'API Connection Checklist',
    apiConnectionIntro:
      'Before connecting, confirm that the UID login card shows your latest Access Key. Gate.io Mainnet and Testnet run on separate credentials and endpoints, so use the key that matches the network.',
    apiConnectionSteps: [
      'Press “UID Login” to refresh your Access Key and make sure it is visible on the UID card. If the code is missing or expired you must log in again before connecting.',
      'Generate a Mainnet API key inside your live Gate.io account with Futures read/write and Spot read permissions. For paper trading visit testnet.gateio.ws and create a dedicated Testnet API key.',
      'Select the target environment (Mainnet or Testnet) from the header toggle before pressing “Connect API.”',
      'Enter the API Key and Secret for that environment and click “Connect API.”',
      'If the key belongs to the opposite environment the backend will auto-detect it and switch networks. After the request completes, confirm the status message and API endpoint (https://api.gateio.ws or https://fx-api-testnet.gateio.ws) to ensure you landed on the right network.',
    ],
    apiConnectionNotesTitle: 'Verify the result & troubleshoot',
    apiConnectionNotes: [
      'A 403 response with uid_not_found, uid_credentials_mismatch, or missing_credentials means the Access Key on file is missing or expired. Press “UID Login” to refresh it or ask the admin to reissue your portal key.',
      'A 403 response with “invalid_credentials” points to a Gate.io API issue—double-check the key permissions (Futures read/trade, etc.) and that you chose the correct network.',
      'Positions or account lookups returning 404 “no_connection” indicate no API key has been stored yet. Repeat the connection steps or confirm that your UID Access Key is approved.',
    ],
  },
  ja: {
    title: 'ご利用ガイド',
    intro: 'UID 認証とシグナル配信をスムーズに開始するための手順です。',
    siteIntroTitle: 'サービス概要',
    siteIntroDescription:
      '本ポータルは TradingView のインジケーター通知を Gate.io 先物アカウントに連携するためのユーザーページです。UID 認証、シグナル確認、API 接続を一つの画面で管理できます。',
    siteHighlights: [
      'UID 承認を受けたユーザーのみが戦略シグナルを受信できるよう制御しています。',
      '承認後はご自身の API キーを接続し、自動売買やリアルタイムシグナルの確認が可能になります。',
      '管理者コンソールでは UID 承認、戦略配信、リアルタイムログを一括監視します。',
    ],
    steps: [
      '画面上部で言語とネットワーク（メインネット / テストネット）を確認し、UID を入力して「UID ログイン」を押します。',
      '「UID 登録」を押すと申請が管理者に送信されます。最大 3 時間以内に承認結果をご案内します。',
      '承認後に API を接続してリアルタイムシグナルを確認できます。Webhook の配信設定は管理者コンソールのみで管理されます。',
    ],
    tips: [
      'ユーザー画面で戦略や Webhook を選択する必要はありません。承認後の戦略は管理者が割り当てます。',
      '別の戦略を希望する場合は管理者に連絡し、承認内容の変更を依頼してください。',
    ],
    apiConnectionTitle: 'APIキー接続ガイド',
    apiConnectionIntro:
      'API接続を行う前に、UIDログインカードに最新のアクセスキーが表示されていることを確認してください。メインネットとテストネットは別環境のため、それぞれに対応するAPIキーで接続する必要があります。',
    apiConnectionSteps: [
      '「UIDログイン」を押してアクセスキー（Access Key）がカード上に表示されているか確認します。表示されない、または期限切れの場合は再ログインして更新してください。',
      'Gate.io本番アカウントでメインネット用APIキーを作成し、先物の読み取り/取引、現物残高閲覧など必要な権限を有効にします。テスト取引を行う場合は testnet.gateio.ws でテストネット用APIキーを別途発行します。',
      '接続したい環境（メインネットまたはテストネット）を画面上部のネットワーク切り替えで先に選択します。',
      '選択したネットワークに対応するAPI KeyとSecretを入力し、「API接続」をクリックします。',
      'キーが別環境用だった場合はシステムが自動検出してネットワークを切り替えます。接続後のステータスメッセージとAPIエンドポイント（https://api.gateio.ws または https://fx-api-testnet.gateio.ws）を確認し、意図した環境になっているかご確認ください。',
    ],
    apiConnectionNotesTitle: '接続結果とエラーの確認',
    apiConnectionNotes: [
      '403 応答で uid_not_found、uid_credentials_mismatch、missing_credentials が表示される場合はアクセスキーが不足または期限切れです。「UIDログイン」でキーを再取得し、必要に応じて管理者に再発行を依頼してください。',
      '403 応答に「invalid_credentials」が含まれる場合は Gate.io APIキーの権限（先物読み取り/取引など）やネットワークの組み合わせを確認し、修正してから再接続してください。',
      'ポジションや口座の取得が404「no_connection」となる場合、まだAPIキーが保存されていません。上記手順で再接続するか、UIDアクセスキーが承認済みかを確認してください。',
    ],
  },
};

const UsageGuide: React.FC = () => {
  const { state } = useAppContext();
  const guide = guides[state.language] ?? guides.ko;

  return (
    <Card title={guide.title} className="mb-5">
      <div className="space-y-5 text-sm text-gray-200">
        <div className="bg-black/30 border border-gate-primary/30 rounded-lg p-4 space-y-2">
          <h3 className="text-base font-semibold text-gate-primary">{guide.siteIntroTitle}</h3>
          <p className="text-sm text-gray-200">{guide.siteIntroDescription}</p>
          {guide.siteHighlights && guide.siteHighlights.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-400">
              {guide.siteHighlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-gray-300">{guide.intro}</p>
          <ol className="list-decimal list-inside space-y-2">
            {guide.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>

        {guide.tips && guide.tips.length > 0 && (
          <div className="bg-black/30 border border-gray-700 rounded-lg p-3 space-y-1 text-xs text-gray-400">
            {guide.tips.map((tip, index) => (
              <p key={index}>• {tip}</p>
            ))}
          </div>
        )}

        {guide.apiConnectionTitle && (
          <div className="space-y-3 bg-black/30 border border-gate-primary/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gate-primary">{guide.apiConnectionTitle}</h3>
            {guide.apiConnectionIntro && <p className="text-xs text-gray-300">{guide.apiConnectionIntro}</p>}
            {guide.apiConnectionSteps && guide.apiConnectionSteps.length > 0 && (
              <ol className="list-decimal list-inside space-y-1 text-xs text-gray-200">
                {guide.apiConnectionSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            )}
            {guide.apiConnectionNotes && guide.apiConnectionNotes.length > 0 && (
              <div className="space-y-2">
                {guide.apiConnectionNotesTitle && (
                  <h4 className="text-xs font-semibold text-gate-primary">
                    {guide.apiConnectionNotesTitle}
                  </h4>
                )}
                <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                  {guide.apiConnectionNotes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default UsageGuide;
