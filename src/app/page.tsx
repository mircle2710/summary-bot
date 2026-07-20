import Link from "next/link";

export default function HomePage() {
  return (
    <section className="hero">
      <h1 className="hero-brand">요약봇</h1>
      <p className="hero-lead">
        관심 채널의 정보를 한곳에 모아 두고, 유튜브 영상을 요약한 뒤
        숏츠 피드 문장과 이미지를 만들어 보세요.
      </p>
      <div className="cta-row">
        <Link href="/channels" className="btn btn-primary">
          채널 관리하기
        </Link>
        <Link href="/summarize" className="btn btn-secondary">
          영상 요약하기
        </Link>
      </div>
    </section>
  );
}
