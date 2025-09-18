import React from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { Language } from '../types';

interface GuideStep {
  title: string;
  description: string;
}

interface GuideCopy {
  cardTitle: string;
  intro: string;
  stepLabel: string;
  steps: GuideStep[];
  highlight: string;
  adminTitle: string;
  adminSteps: string[];
}

const GUIDE_CONTENT: Record<Language, GuideCopy> = {
  ko: {
    cardTitle: '사용 가이드',
    intro: 'UID 인증부터 승인된 전략 신호 수신까지 아래 순서를 참고하세요.',
    stepLabel: '단계',
    steps: [
      {
        title: 'UID 로그인 시작',
        description:
          '상단 헤더에서 사용할 언어와 네트워크(메인넷·테스트넷)를 확인한 뒤 UID를 입력하고 "UID 로그인"을 눌러 인증을 준비합니다.'
      },
      {
        title: '전략 선택 및 신청',
        description:
          '받고 싶은 지표 신호 전략을 선택하고 "UID 등록"을 누르면 신청이 접수됩니다. 버튼을 누르면 최대 2시간까지 승인이 걸릴 수 있다는 경고 알림이 뜹니다.'
      },
      {
        title: '승인 진행 상황 확인',
        description:
          '신청 후 상태가 "승인 대기"로 표시되며, 관리자가 허용하면 승인으로 바뀌고 Access Key와 승인된 전략 목록이 업데이트됩니다. 거절되면 안내 문구를 확인할 수 있습니다.'
      },
      {
        title: 'API 연결 준비',
        description:
          'UID로 로그인하면 "API 연결" 버튼이 활성화됩니다. 네트워크(메인넷·테스트넷)를 다시 확인한 뒤 Gate.io API Key와 Secret을 입력해 연결하세요.'
      },
      {
        title: '실시간 신호 활용',
        description:
          '관리자 페이지의 대표 웹훅으로 전달된 신호는 자동으로 브로드캐스트됩니다. 실시간 신호 카드에서 내가 선택한 전략 신호만 확인하고 활용할 수 있습니다.'
      }
    ],
    highlight: '알림: UID 인증은 최대 2시간까지 소요될 수 있으니 승인 완료 안내가 올 때까지 기다려 주세요.',
    adminTitle: '관리자 빠른 안내',
    adminSteps: [
      '브라우저 주소창 끝에 /admin 을 붙여 관리자 페이지에 접속하세요.',
      '백엔드에서 발급받은 ADMIN_SECRET 값과 동일한 관리자 토큰으로 로그인하면 승인 대기 목록이 열립니다.',
      '각 UID 신청에서 전략을 확인해 승인·거절을 처리하고, 대표 웹훅으로 들어오는 신호를 선택한 회원들에게 중계할 수 있습니다.'
    ]
  },
  en: {
    cardTitle: 'Usage Guide',
    intro: 'Follow these steps to move from UID verification to receiving strategy signals.',
    stepLabel: 'Step',
    steps: [
      {
        title: 'Start with UID Login',
        description:
          'Check your preferred language and network (Mainnet/Testnet) in the header, enter your UID, and press "UID Login" to begin authentication.'
      },
      {
        title: 'Choose Strategies and Apply',
        description:
          "Select the indicator strategies you want to follow and press 'Register UID'. A warning pops up noting that approval may take up to two hours."
      },
      {
        title: 'Track Your Approval Status',
        description:
          'After submitting, the status changes to "Pending". Once the admin approves you, the Access Key and approved strategy list are updated. If denied, you will see a helpful notice.'
      },
      {
        title: 'Prepare the API Connection',
        description:
          'Once you log in with your UID, the "Connect API" button becomes active. Double-check the selected network (Mainnet/Testnet) and enter your Gate.io API Key and Secret to connect.'
      },
      {
        title: 'Use Live Signals',
        description:
          'Signals sent through the admin console’s master webhook are broadcast automatically. The live signal card only shows the strategies you opted into so you can react quickly.'
      }
    ],
    highlight: 'Reminder: UID verification can take up to two hours. Please wait until the approval notification arrives.',
    adminTitle: 'Quick guide for admins',
    adminSteps: [
      'Append /admin to the site URL to open the management console.',
      'Sign in with the admin token that matches the backend ADMIN_SECRET to unlock the pending request list.',
      'Review each UID request, approve or deny the selected strategies, and relay master-webhook signals to subscribed members.'
    ]
  },
  ja: {
    cardTitle: 'ご利用ガイド',
    intro: 'UID認証から戦略シグナル受信までの流れを以下のステップで確認してください。',
    stepLabel: 'ステップ',
    steps: [
      {
        title: 'UIDログインを開始',
        description:
          'ヘッダーで使用する言語とネットワーク（メインネット／テストネット）を確認し、UIDを入力して「UIDログイン」を押して認証を始めます。'
      },
      {
        title: '戦略を選んで申請',
        description:
          '受信したい指標シグナル戦略を選択して「UID登録」を押すと申請が送信されます。最大2時間かかるという警告メッセージが表示されます。'
      },
      {
        title: '承認状況をチェック',
        description:
          '申請後はステータスが「承認待ち」と表示され、管理者が許可すると「承認済み」に変わり、アクセスキーと承認済み戦略の一覧が更新されます。却下された場合は案内メッセージが表示されます。'
      },
      {
        title: 'API接続の準備',
        description:
          'UIDでログインすると「API接続」ボタンが有効になります。選択中のネットワーク（メインネット／テストネット）を再確認し、Gate.ioのAPI KeyとSecretを入力して接続してください。'
      },
      {
        title: 'ライブシグナルを活用',
        description:
          '管理者コンソールの代表Webhookに届いたシグナルは自動で配信されます。ライブシグナルカードでは自分が選んだ戦略の情報だけを確認できます。'
      }
    ],
    highlight: 'ご注意: UID認証には最大2時間ほどかかる場合があります。承認完了の通知が届くまでお待ちください。',
    adminTitle: '管理者向けの簡単な流れ',
    adminSteps: [
      'URLの末尾に /admin を付けて管理コンソールを開きます。',
      'バックエンドの ADMIN_SECRET と同じ管理者トークンでサインインすると承認待ちリストが表示されます。',
      '各UID申請を確認して承認・却下を行い、代表Webhookに届いたシグナルを購読中の会員へ配信します。'
    ]
  }
};

const UsageGuide: React.FC = () => {
  const { state } = useAppContext();
  const content = GUIDE_CONTENT[state.language] ?? GUIDE_CONTENT.ko;

  return (
    <Card title={content.cardTitle} className="mb-5">
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-gray-200">{content.intro}</p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {content.steps.map((step, index) => (
            <div
              key={step.title}
              className="flex h-full gap-4 rounded-xl border border-gray-700 bg-black/30 p-4 shadow-inner"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gate-primary/20 text-base font-semibold text-gate-primary">
                {index + 1}
              </div>
              <div className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gate-primary/80">
                  {content.stepLabel} {index + 1}
                </span>
                <h3 className="text-base font-semibold text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-gray-200">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border-l-4 border-gate-primary bg-black/40 p-4 text-sm leading-relaxed text-gray-100">
          {content.highlight}
        </div>

        <div className="rounded-xl border border-gray-700 bg-black/30 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gate-primary">{content.adminTitle}</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm leading-relaxed text-gray-200">
            {content.adminSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

      </div>
    </Card>
  );
};

export default UsageGuide;
