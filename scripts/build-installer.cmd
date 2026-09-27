@echo off
rem ---------------------------------------------------------------------
rem إنشاء مُثبِّت Windows (NSIS) عن طريق electron-builder.
rem
rem على Windows قد يحتاج electron-builder إلى صلاحيات لإنشاء روابط رمزية
rem أثناء فكّ ضغط أدوات التوقيع (winCodeSign). شغّل هذا الملف بالنقر
rem بزر الفأرة الأيمن ثم «تشغيل كمسؤول» إذا ظهر الخطأ:
rem   Cannot create symbolic link : A required privilege is not held by the client
rem
rem كل المخرجات تُحفظ في release\ ومجلد السجلّ في build-installer.log
rem ---------------------------------------------------------------------
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo [build-installer] لم يتم العثور على node في PATH.
  exit /b 1
)

echo [build-installer] مجلد المشروع: %CD%
echo [build-installer] جارٍ تجهيز better-sqlite3 وبناء المُثبِّت...

call npm run dist > build-installer.log 2>&1
set STATUS=%ERRORLEVEL%
type build-installer.log

echo [build-installer] انتهى التنفيذ برمز %STATUS%
if exist release (
  echo [build-installer] مخرجات البناء:
  dir /b release
)
exit /b %STATUS%
