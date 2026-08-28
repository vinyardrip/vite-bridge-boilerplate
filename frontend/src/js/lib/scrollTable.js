function scrollTable() {
    $('table').wrap('<div class="big-table"></div>');

    function resizeTableBox() {
        // eslint-disable-next-line func-names
        $('.big-table').each(function () {
            const boxWidth = $(this).outerWidth();
            const tableWidth = $(this).children('table').prop('scrollWidth');
            $(this).removeClass('scroll-left');
            if (tableWidth > boxWidth) {
                $(this).addClass('scroll-right');
            } else {
                $(this).removeClass('scroll-right');
            }
        });
    }

    resizeTableBox();
// eslint-disable-next-line func-names
    $(window).on('resize', () => {
        resizeTableBox();
    });

// eslint-disable-next-line func-names
    $('.big-table table').on('scroll', function() {
        const parent = $(this).parent();
        if ($(this).scrollLeft() + $(this).innerWidth() >= $(this)[0].scrollWidth) {
            if (parent.hasClass('scroll-right')) {
                parent.removeClass('scroll-right');
            }
        } else if ($(this).scrollLeft() === 0) {
            if (parent.hasClass('scroll-left')) {
                parent.removeClass('scroll-left');
            }
        } else {
            if (!parent.hasClass('scroll-right')) {
                parent.addClass('scroll-right');
            }
            if (!parent.hasClass('scroll-left')) {
                parent.addClass('scroll-left');
            }
        }
    });
}

module.exports = scrollTable;
