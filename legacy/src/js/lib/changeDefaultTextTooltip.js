function changeDefaultTextTooltip(input) {
    input.addEventListener('input', function() {
        if (input.validity.patternMismatch) {
            input.setCustomValidity('Вы ошиблись. Не хватает цифр, либо неверно указан код оператора');
        } else {
            input.setCustomValidity('');
        }
    });
}

module.exports = changeDefaultTextTooltip;
