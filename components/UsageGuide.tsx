import React from 'react';
import Card from './Card';

interface GuideSection {
  language: string;
  steps: string[];
}

const sections: GuideSection[] = [
  {
    language: '한국어',
    steps: [
      '상단에서 사용할 언어와 네트워크(메인넷/테스트넷)를 확인한 뒤, UID를 입력하고 "UID 로그인"을 눌러 본인 인증을 시작합니다.',
      "받고 싶은 지표 신호 전략을 선택한 뒤 'UID 등록'을 누르면 최대 2시간 이내로 관리자 승인이 진행됩니다.",
      '승인이 완료되면 접근 키가 발급되고, 선택한 전략만 내 계정으로 전달되도록 자동으로 연결됩니다.',
      "UID 인증이 된 상태에서만 API 연결과 웹훅 복사, 신호 수신이 가능하니 인증 완료 후 'API 연결'을 진행하세요.",
      "관리자는 브라우저 주소창 끝에 /admin 을 입력해 관리자 페이지에 접속하고, 관리자 토큰으로 로그인해 승인/거절 및 웹훅 신호 모니터링을 할 수 있습니다."
    ]
  },
  {
    language: 'English',
    steps: [
      'Check your preferred language and network (Mainnet/Testnet) at the top, enter your UID, and press "UID Login" to authenticate.',
      "Choose the indicator strategies you want to follow, then press 'Register UID'. Approval may take up to two hours.",
      'Once approved you will receive an access key, and only the strategies you selected will be relayed to your dashboard.',
      'API connection, webhook copying, and live signals are available only after UID verification, so connect the API once authentication is done.',
      'Admins can open the management console by adding /admin to the URL, sign in with the admin token, and approve, reject, or monitor webhook signals for every member.'
    ]
  },
  {
    language: '日本語',
    steps: [
      '上部で言語とネットワーク（メインネット／テストネット）を確認し、UIDを入力して「UIDログイン」を押すと本人確認が始まります。',
      '受信したい指標シグナル戦略を選択して「UID登録」を押すと、最長2時間ほどで管理者の承認が行われます。',
      '承認されるとアクセスキーが発行され、選択した戦略だけがあなたのダッシュボードに配信されます。',
      'UID認証が完了している場合にのみAPI接続・Webhookコピー・シグナル受信が可能なので、認証後にAPI接続を行ってください。',
      '管理者はブラウザのURL末尾に /admin を追加して管理ページにアクセスし、管理者トークンでログインして会員の承認やWebhookシグナルの監視ができます。'
    ]
  }
];

const UsageGuide: React.FC = () => {
  return (
    <Card title="사용 가이드 / Usage Guide / ご利用ガイド" className="mb-5">
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <div key={section.language} className="bg-black/30 border border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-base font-semibold text-gate-primary">{section.language}</h3>
            <ol className="list-decimal list-inside text-sm text-gray-200 space-y-2">
              {section.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default UsageGuide;
