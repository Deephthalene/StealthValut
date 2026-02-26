// ============================================
// purchase_email.rs - 구매 요청 SMTP 전송 (발신 계정 고정)
// ============================================

use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

const TO_EMAIL: &str = "gjsdlfkddmsd@gmail.com";
const SMTP_USER: &str = "kares28@naver.com";
const SMTP_PASS: &str = "EGTZYER4EK8D";

pub async fn send_purchase_request_email(name: &str, email: &str) -> Result<(), String> {

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let body = format!(
        "StealthVault 구매 요청\n\n이름: {}\n이메일: {}\n요청 시각: {}",
        name.trim(),
        email.trim(),
        now
    );

    let email_msg = Message::builder()
        .from(
            format!("StealthVault <{}>", SMTP_USER)
                .parse()
                .map_err(|e: lettre::address::AddressError| e.to_string())?,
        )
        .to(TO_EMAIL.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .subject("[StealthVault 구매 요청]")
        .header(ContentType::TEXT_PLAIN)
        .body(body)
        .map_err(|e| e.to_string())?;

    let creds = Credentials::new(SMTP_USER.to_string(), SMTP_PASS.to_string());

    // Naver SMTP (smtp.naver.com, STARTTLS 587)
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay("smtp.naver.com")
            .map_err(|e| format!("SMTP 연결 설정 실패: {}", e))?
            .credentials(creds)
            .build();

    mailer
        .send(email_msg)
        .await
        .map_err(|e| format!("이메일 전송 실패: {}", e))?;

    Ok(())
}
