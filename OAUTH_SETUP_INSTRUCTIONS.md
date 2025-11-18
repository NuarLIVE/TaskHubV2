# OAuth Setup Instructions

## 🔧 Critical Setup Required

OAuth вход не будет работать пока вы не настроите провайдеры в Supabase Dashboard.

## ✅ Настройка в Supabase Dashboard

### 1. Откройте Supabase Dashboard

Перейдите: https://supabase.com/dashboard/project/rpbdamgcikqdmptficsc

### 2. Настройте Google OAuth

1. **Перейдите в:** `Authentication` → `Providers` → `Google`
2. **Включите:** Toggle "Enable Sign in with Google" to ON
3. **Введите данные:**
   - **Client ID:** `737158338678-sh7b8si9b659orc8m2cokbmvktnlpa74.apps.googleusercontent.com`
   - **Client Secret:** `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`
4. **Redirect URL (уже настроен в Google):**
   ```
   https://rpbdamgcikqdmptficsc.supabase.co/auth/v1/callback
   ```
5. **Нажмите:** "Save"

### 3. Настройте GitHub OAuth

1. **Перейдите в:** `Authentication` → `Providers` → `GitHub`
2. **Включите:** Toggle "Enable Sign in with GitHub" to ON
3. **Введите данные:**
   - **Client ID:** `Ov23lirMuOYbKZi7PaAM`
   - **Client Secret:** `a386a6bee00821fe058595681a3d2a8847e5fe5c`
4. **Redirect URL (уже настроен в GitHub):**
   ```
   https://rpbdamgcikqdmptficsc.supabase.co/auth/v1/callback
   ```
5. **Нажмите:** "Save"

### 4. Настройте Site URL и Redirect URLs (КРИТИЧНО!)

1. **Перейдите в:** `Authentication` → `URL Configuration`

2. **Site URL должен быть:**
   ```
   https://taskhub.space
   ```

3. **Redirect URLs ДОЛЖНЫ ВКЛЮЧАТЬ (каждый с новой строки):**
   ```
   https://taskhub.space
   https://taskhub.space/
   http://localhost:5173
   http://localhost:5173/
   ```

   **ВАЖНО:**
   - НЕ используйте `#/` в redirect URLs
   - Приложение само добавит hash routing
   - Без правильных redirect URLs OAuth не будет работать
   - Добавьте каждый URL как отдельную строку

## 🧪 Тестирование

После настройки в Supabase Dashboard:

1. Откройте приложение
2. Перейдите на страницу входа: `https://taskhub.space/#/login`
3. Нажмите "Continue with Google" или "Continue with GitHub"
4. Вы должны увидеть:
   - Редирект на Google/GitHub
   - Страницу авторизации
   - Редирект обратно на `https://taskhub.space/#access_token=...`
   - Автоматическое открытие страницы `/oauth-callback`
   - Сообщение "✅ Authentication successful! Redirecting..."
   - Редирект на главную страницу
   - Вы вошли в систему

## 📊 Диагностика

Если вход не работает:

1. **Откройте DevTools Console (F12)**
2. **Проверьте логи:**
   ```
   OAuth callback detected, showing callback page...
   OAuth Callback - Current URL: ...
   OAuth Callback - Hash: ...
   ✅ Session found: ...
   ```

3. **Проверьте Network tab:**
   - Должен быть запрос к `/auth/v1/token`
   - Статус должен быть 200

4. **Если видите ошибки:**
   - "OAuth provider not configured" → Провайдер не включен в Supabase
   - "Invalid client" → Неверный Client ID или Secret
   - "Redirect URI mismatch" → Проверьте Redirect URLs

## 🔍 Проверка настроек в Supabase

### Как проверить что настройки применились:

1. **Перейдите в Supabase Dashboard**
2. **Authentication → Providers**
3. **Для Google и GitHub должно быть:**
   - ✅ Зеленая галочка "Enabled"
   - ✅ Client ID заполнен
   - ✅ Client Secret заполнен (показан как •••)

### Как проверить что OAuth работает:

1. **В Supabase Dashboard → Authentication → Users**
2. **После успешного входа должен появиться:**
   - Новый пользователь
   - Provider: `google` или `github`
   - Email из OAuth аккаунта

## 🚨 Важно

### Данные в `.env` НЕ используются для OAuth

Файл `.env` содержит ключи для справки, но **OAuth настраивается только через Supabase Dashboard**.

Ключи в `.env`:
```env
VITE_GITHUB_CLIENT_ID=...
VITE_GITHUB_CLIENT_SECRET=...
VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_CLIENT_SECRET=...
```

**НЕ ИСПОЛЬЗУЮТСЯ** приложением напрямую. Это просто для документации.

### OAuth настраивается в:
✅ **Supabase Dashboard → Authentication → Providers**

## 📝 Что делает приложение

1. **При клике на OAuth кнопку:**
   - `supabase.auth.signInWithOAuth({ provider: 'google' })`
   - Редирект на провайдера

2. **После авторизации:**
   - Провайдер редиректит на: `https://rpbdamgcikqdmptficsc.supabase.co/auth/v1/callback`
   - Supabase обрабатывает callback
   - Supabase редиректит на: `https://taskhub.space/#/` с токенами в hash

3. **Приложение обрабатывает:**
   - Обнаруживает `access_token` в URL
   - Показывает страницу `/oauth-callback`
   - Получает сессию через `supabase.auth.getSession()`
   - Редиректит на главную

4. **AuthContext подхватывает:**
   - `onAuthStateChange` срабатывает
   - Загружается профиль
   - Пользователь авторизован

## ✅ Checklist

Перед тестированием убедитесь:

- [ ] Google OAuth включен в Supabase Dashboard
- [ ] Google Client ID и Secret введены
- [ ] GitHub OAuth включен в Supabase Dashboard
- [ ] GitHub Client ID и Secret введены
- [ ] Site URL: `https://taskhub.space`
- [ ] Redirect URLs добавлены
- [ ] Приложение пересобрано (`npm run build`)

## 🎯 Результат

После настройки:

✅ Пользователь может войти через Google
✅ Пользователь может войти через GitHub
✅ Профиль создается автоматически
✅ Нет ошибок 404
✅ Нет бесконечных редиректов
✅ Пользователь попадает на главную страницу
