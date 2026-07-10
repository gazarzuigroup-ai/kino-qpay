# kino-qpay

Facebook Messenger (ManyChat) + QPay + Bunny Stream ашигласан кино худалдааны бот backend.

## Урсгал

1. Хэрэглэгч Facebook Page-т мессеж бичнэ
2. ManyChat киноны товч харуулна ("Худалдаж авах")
3. Товч дархад ManyChat → `POST /api/manychat/create-invoice` дуудна
4. Бид QPay нэхэмжлэх үүсгээд QR + банкны линк буцаана
5. Хэрэглэгч төлнө → QPay `POST /api/qpay/callback` дуудна
6. Хэрэглэгч "Төлсөн" товч дархад ManyChat → `POST /api/manychat/check-payment`
7. Бид токентой `/watch/:token` линк буцаана
8. Хэрэглэгч линк дээр ороод киногоо үзнэ

## Суулгах

```bash
cd C:/Users/User/Downloads/kino
npm install
cp .env.example .env
# .env-г засаад QPay, Bunny credential-үүдээ бөглөнө
npm run dev
```

## Public URL үүсгэх (dev)

ManyChat болон QPay-д HTTPS URL хэрэгтэй. Локал тест хийхэд:

```bash
# ngrok
ngrok http 3000
# эсвэл cloudflared
cloudflared tunnel --url http://localhost:3000
```

Гарсан HTTPS URL-г `.env`-ийн `PUBLIC_URL`-д хийнэ.

## ManyChat тохиргоо

1. **manychat.com** дээр Facebook Page-ээ холбоно
2. **Automation → New Flow** үүсгэнэ
3. Дараах step-үүд оруулна:
   - **Message**: Киноны танилцуулга + "Худалдаж авах" button
   - Button → **Actions → External Request**:
     - URL: `https://your-public-url/api/manychat/create-invoice`
     - Method: POST
     - Body (JSON):
       ```json
       {
         "manychat_id": "{{cuf_manychat_id}}",
         "name": "{{first_name}} {{last_name}}",
         "movie_slug": "demo"
       }
       ```
     - Response Mapping: **v2** сонгоно
   - "Төлсөн" button → **External Request**:
     - URL: `https://your-public-url/api/manychat/check-payment`
     - Body: `{ "order_id": "{{cuf_order_id}}" }`

Custom User Field үүсгэх: `order_id`, `qpay_invoice_id`, `watch_url` (text).

## QPay тохиргоо

1. **qpay.mn** merchant account
2. Тэдгээр `client_id`, `client_secret`, `invoice_code` авна
3. Callback URL-г `{PUBLIC_URL}/api/qpay/callback` хэлбэрээр систем автоматаар илгээнэ

## Bunny Stream

1. **bunny.net** → **Stream** service нээнэ
2. Video Library үүсгээд киногоо upload хийнэ
3. Library → **Security** → **Token Authentication Enabled** болгож `Token Authentication Key` хуулна
4. Videos → тухайн киноны **GUID**-г авна
5. DB-д movie бүртгэнэ:
   ```sql
   INSERT INTO movies (slug, title, price, bunny_video_id)
   VALUES ('avatar', 'Avatar', 8000, 'xxxx-guid-here');
   ```

## Хамгаалалт

- Токен 48 цаг хүчинтэй (тохируулж болно)
- 1 токен = 3 үзэлт
- Эхний IP-д түгжинэ (өөр IP-ээс нээхэд 403)
- Bunny signed URL 4 цагаар expire болно
- HLS + Bunny Token Authentication — түгээх линкийг direct download хийхэд хэцүү
- Player-т `oncontextmenu` disabled + `controlsList="nodownload"`

## Product-т явахын өмнө

- PostgreSQL руу шилжих (SQLite ганц instance-т сайн)
- QPay callback IP whitelist (QPay-ээс жагсаалт авах)
- Rate limiting нэмэх (`express-rate-limit`)
- Логийн систем (pino/winston)
- Sentry болон monitoring
- Bunny DRM (Widevine) — өндөр үнэтэй контентын хувьд
