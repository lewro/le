
function invalidate(element) {
  $(element).addClass('validation_error');

  if ($(element).is('textarea')) {
    $(element).show();
    return $(element).prev('.textarea').hide();
  }
}

function validate(element) {
  return $(element).removeClass('validation_error');
}

function max_size(element) {
  const filter = new RegExp(/^\s*$/);

  if (filter.test($(element).val())) {
      return invalidate(element);
  } else {
    if ($(element).val().length < 200) {
      validate(element);
      return not_empty_input(element);
    } else {
      return invalidate(element);
    }
  }
}

function min_size(element, size) {
  if ($(element).val().length > size) {
    return validate(element);
  } else {
    return invalidate(element);
  }
}

function not_empty_input(element) {
  const filter = new RegExp(/^\s*$/);

  if (filter.test($(element).val())) {
    invalidate(element);

  } else {
    validate(element);
  }
}

function email_valid(element) {
  const filter = new RegExp(/^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/);

  if (filter.test($(element).val())) {
    return validate(element);
  } else {
    return invalidate(element);
  }

}

function integ_valid(element) {
  const filter = new RegExp(/^([0-9])+$/);
  if (filter.test($(element).val())) {
    return validate(element);
  } else {
    return invalidate(element);
  }
}

function validateForm(form) {

  //Empty Input?
  if ($(form).find('input[type="text"]').length > 0) {

    $(form).find('input[type="text"]').each(function() {
      if ($(this).data("required") === true) {
        return not_empty_input($(this));
      }
    });
  }

  if ($(form).find('input[type="number"]').length > 0) {
    $(form).find('input[type="number"]').each(function() {
      if ($(this).data("required") === true) {
        return not_empty_input($(this));
      }
    });
  }

  if ($(form).find('input[type="password"]').length > 0) {
    $(form).find('input[type="password"]').each(function() {
      not_empty_input($(this));
      return min_size($(this), 4);
    });
  }

  //Empty Textarea?
  if ($(form).find('textarea').length > 0) {
    $(form).find('textarea').each(function() {
      if ($(this).data("required") === true) {
        not_empty_input($(this));

        //Not too long?
        if (!$(this).hasClass('long-text')) {
          return max_size($(this));
        }
      }
    });
  }

  //Email?
  if ($(form).find('input[type="email"]').length > 0) {
    $(form).find('input[type="email"]').each(function() {
      if ($(this).data("required") === true) {
        return email_valid($(this));
      }
    });
  }

  //Integral?
  if ($(form).find('input[type="number"]').length > 0) {
    $(form).find('input[type="number"]').each(function() {
      if ($(this).data("required") === true) {
        return integ_valid($(this));
      }
    });
  }

  if ($(form).find('.validation_error').length > 0) {
    return false;
  } else {
    return true;
  }
}






