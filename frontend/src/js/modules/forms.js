/**
 * =================================================================================================
 * forms.js (v3.1 - Восстановлен санитайзер ввода)
 * =================================================================================================
 *
 * Модуль для управления всеми формами на сайте.
 * Использует переменные окружения Vite для разделения логики отправки.
 *
 * =================================================================================================
 */
import Inputmask from 'inputmask';
import { openModal } from './modals.js';

// Логика кастомного тултипа для полей телефона
const initPhoneTooltip = (phoneInput) => {
  phoneInput.addEventListener('input', () => {
    if (phoneInput.validity.patternMismatch) {
      phoneInput.setCustomValidity(
        'Вы ошиблись. Не хватает цифр, либо неверно указан код оператора',
      );
    } else {
      phoneInput.setCustomValidity('');
    }
  });
};

// ... (функции sendFormData и simulateFormSubmission без изменений) ...
const sendFormData = (form, data, button) => {
  fetch('mailer/smart.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  .then(response => {
    if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
    return response.json();
  })
  .then(result => {
    if (result.status === 'success') {
      form.reset();
      openModal('thanks');
    } else {
      throw new Error(result.message || 'Сервер вернул ошибку');
    }
  })
  .catch(error => {
    console.error('Ошибка отправки формы:', error);
    alert('Произошла ошибка при отправке формы.');
  })
  .finally(() => {
    if (button) button.disabled = false;
  });
};

const simulateFormSubmission = (form, data, button) => {
  console.log('ИМИТАЦИЯ ОТПРАВКИ (DEV-РЕЖИМ). Данные:', data);
  setTimeout(() => {
    console.log('Форма успешно отправлена (имитация)');
    form.reset();
    openModal('thanks');
    if (button) button.disabled = false;
  }, 1000);
};


export const initForms = () => {
  const forms = document.querySelectorAll('[data-form]');

  forms.forEach((form, formIndex) => {
    const phoneInput = form.querySelector('input[type="tel"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const locationInput = form.querySelector('input[name="loc"]');
    const botField = form.querySelector('input[name="bot-field"]');

    if (locationInput) {
      locationInput.value = `Форма №${formIndex + 1}`;
    }

    if (phoneInput) {
      // 1. Инициализация маски
      const inputMask = new Inputmask('+375 (99) 999-99-99');
      inputMask.mask(phoneInput);

      // 2. Инициализация кастомного тултипа
      initPhoneTooltip(phoneInput);

      // 3. ВОССТАНОВЛЕННАЯ ЛОГИКА: Санитайзер ввода
      phoneInput.addEventListener('input', (e) => {
        // Этот обработчик удаляет все символы, кроме цифр и знака "+"
        e.target.value = e.target.value.replace(/[^0-9+]/g, '');
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (botField && botField.value.trim() !== '') {
        console.warn('Попытка отправки формы ботом заблокирована.');
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
      }

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      if (import.meta.env.DEV) {
        simulateFormSubmission(form, data, submitButton);
      } else {
        sendFormData(form, data, submitButton);
      }
    });
  });
};