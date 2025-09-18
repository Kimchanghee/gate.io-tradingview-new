import React from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

type GuideContent = {
  title: string;
  intro: string;
  steps: string[];
  tips?: string[];
};

const guides: Record<string, GuideContent> = {
  ko: {
    title: '사용 가이드',
    intro: 'UID 인증과 신호 구독을 빠르게 설정하려면 아래 순서를 따라 주세요.',
    steps: [
      '상단에서 언어와 네트워크(메인넷·테스트넷)를 확인한 뒤 UID를 입력하고 로그인합니다.',
      '관심 있는 지표/전략을 선택해 등록 요청을 보내면 관리자가 승인 상태를 업데이트합니다.',
      '승인 후에는 API 연결과 실시간 신호 확인이 가능하며, 웹훅 전달 여부는 관리자 콘솔에서만 관리됩니다.',
    ],
    tips: [
      '사용자 화면에는 웹훅 설정이 없습니다. 전략별 웹훅 대상은 관리자 페이지에서만 조정합니다.',
      '전략을 바꾸고 싶다면 다시 등록 카드에서 선택을 수정한 뒤 관리자에게 요청하세요.',
    ],
  },
  en: {
    title: 'Usage Guide',
    intro: 'Follow these steps to request access and receive indicator signals without delay.',
    steps: [
      'Double-check the language and network (Mainnet or Testnet), then enter your UID and press “UID Login”.',
      'Pick the indicator strategies you want, submit the registration request, and wait for the admin approval notice.',
      'Once approved you can connect the API and read live signals. Webhook delivery itself is managed only from the admin console.',
    ],
    tips: [
      'End users no longer configure webhooks. The admin decides which strategies are delivered through the global webhook.',
      'If you want different strategies later, update your selections and send a new request for the admin to review.',
    ],
  },
  ja: {
    title: 'ご利用ガイド',
    intro: 'UID 認証とシグナル配信をスムーズに開始するための手順です。',
    steps: [
      '画面上部で言語とネットワーク（メインネット / テストネット）を確認し、UID を入力して「UID ログイン」を押します。',
      '受信したい指標・戦略を選択して申請を送信し、管理者からの承認通知を待ちます。',
      '承認後に API を接続してリアルタイムシグナルを確認できます。Webhook の配信設定は管理者コンソールのみで変更されます。',
    ],
    tips: [
      'ユーザー画面から Webhook を操作することはできません。どの戦略を配信するかは管理者がページ上で選択します。',
      '別の戦略を希望する場合は再度選択を更新して申請し、管理者に承認を依頼してください。',
    ],
  },
};

const UsageGuide: React.FC = () => {
  const { state } = useAppContext();
  const guide = guides[state.language] ?? guides.ko;

  return (
    <Card title={guide.title} className="mb-5">
      <div className="space-y-4 text-sm text-gray-200">
        <p className="text-gray-300">{guide.intro}</p>
        <ol className="list-decimal list-inside space-y-2">
          {guide.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        {guide.tips && guide.tips.length > 0 && (
          <div className="bg-black/30 border border-gray-700 rounded-lg p-3 space-y-1 text-xs text-gray-400">
            {guide.tips.map((tip, index) => (
              <p key={index}>• {tip}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default UsageGuide;
