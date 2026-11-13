/* Inicializa o app após carregar núcleo, scanner e recursos de receitas. */
initDarkMode();
initFoodCatalog();
render();
renderShopping();
initFirstRunGuide();
updateBackupStatus();
updateNotificationPreferenceUI();
checkAndNotifyExpirations();
initWelcomeIntro();
setInterval(render, 60000);
