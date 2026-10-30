# Vize Kampı – 2. Sınıf

2. sınıf vize hazırlık sitesi: 8 ders, birleşik konu anlatımı, sesli dinleme, etkileşimli testler (çoktan seçmeli, doğru/yanlış, boşluk doldurma, eşleştirme, resim soruları) ve kişiye özel “Eksiklerim” takibi.

Saf HTML/CSS/JavaScript; derleme ya da sunucu gerekmez.

## GitHub Pages ile yayınlama

1. Bu dosyaların tamamını depoya yükle (kök klasöre; `index.html` en üstte olmalı).
2. Depoda **Settings → Pages** sayfasını aç.
3. **Build and deployment → Source** kısmında **GitHub Actions**'ı seç.
4. `main` dalına her gönderimde `.github/workflows/pages.yml` siteyi otomatik yayınlar.
   Birkaç dakika sonra site şu adreste açılır: `https://<kullanıcı-adın>.github.io/<depo-adı>/`

> Alternatif: **Source → Deploy from a branch → main / (root)** seçeneği de çalışır (`.nojekyll` dosyası bunun için var).

## Bilgisayarda açmak
`index.html` dosyasına çift tıklamak yerine basit bir sunucu kullan (tarayıcılar `file://` ile bazı dosyaları engelleyebilir):
```bash
python -m http.server 8000
# sonra http://localhost:8000 adresini aç
```

## Klasör yapısı
| Yol | İçerik |
|---|---|
| `index.html`, `css/`, `js/app.js` | Uygulama |
| `data/courses.js` | Ders listesi (ad, renk, Drive linki) |
| `data/<ders>.js` | Her dersin konu anlatımı, soruları ve eşleştirme kartları |
| `img/` | Ders görselleri |

Dersler: `antik` (Antik Yerleşimler), `dinler`, `sanat`, `mito` (Türk Mitolojisi), `surd` (Sürdürülebilir Turizm), `turizm` (Turizm Acentacılığı), `ik` (İnsan Kaynakları), `ing` (Mesleki İngilizce).

## Notlar
- Adıyla (ya da misafir olarak) giren kişinin çözdüğü her soru doğru/yanlış olarak kaydedilir. Yeni testlerde **çözülmüş sorular tekrar gelmez**, yalnızca henüz sorulmamış sorular sorulur. Yanlışlar “Yanlışlarımı Tekrar” modunda, istenirse tüm sorular “Çözdüklerimi de sor” seçeneğiyle tekrar çözülebilir.
- Kayıtlar (ad / misafir, ders ders eksikler) tarayıcının yerel depolamasında tutulur. Başka cihaza taşımak için **Eksiklerim → Dışa aktar / İçe aktar**.
- Sesli okuma tarayıcının yerleşik Türkçe sesini kullanır (Chrome, Edge, Safari). Hız 0.8×–2× arası seçilebilir ve hatırlanır. Okuma sürerken ekran açık tutulur (Screen Wake Lock); ekran kilitlenip okuma kesilirse, kilit açılınca kaldığı cümleden devam eder. Kilit ekranı / kulaklık düğmeleriyle duraklat-devam-ileri-geri yapılabilir.
- PDF: **Eksiklerim → PDF olarak al → Yazdır / PDF olarak kaydet**.
