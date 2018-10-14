from django import forms
from django.contrib.auth.forms import UserCreationForm
from webapp.models import User
from webapp.models import Message
from webapp.models import Rating

class MessageForm(forms.ModelForm):

  class Meta:
    model    = Message
    fields   = (
      'to_user',
      'from_user',
      'replied_message',
      'body'
      )

    def save(self, commit=True):
      message                  = super(MessageForm, self)
      message.user_from        = self.cleaned_data('from_user')
      message.user_to          = self.cleaned_data('to_user')
      message.replied_message  = self.cleaned_data('replied_message')
      message.body             = self.cleaned_data('body')

      if commit:
        message.save()

      return message

class RatingForm(forms.ModelForm):

  class Meta:
    model    = Rating
    fields   = (
      'to_user',
      'from_user',
      'rating',
      'body'
      )

    def save(self, commit=True):
      rating                  = super(RatingForm, self)
      rating.user_from        = self.cleaned_data('from_user')
      rating.user_to          = self.cleaned_data('to_user')
      rating.rating           = self.cleaned_data('rating')
      rating.body             = self.cleaned_data('body')

      if commit:
        rating.save()

      return rating

class RegistrationForm(UserCreationForm):

  email = forms.EmailField(required=True)

  class Meta:
    model    = User
    fields   = (
      'category_id',
      'first_name',
      'last_name',
      'bio',
      'company',
      'email',
      'password1',
      'password2',
      'phone',
      'mobile',
      'web',
      'district_id',
      'district',
      'country',
      'street',
      'street_number',
      'city',
      'zipcode',
      'latitude',
      'longtitude',
      'experience',
      'expertise',
      'hour_rate_from',
      'hour_rate_to',
      'profile_img'
      )
    def save(self, commit=True):

      user = super(RegistrationForm, self)

      user.category_id      = self.cleaned_data('category_id')
      user.email            = self.cleaned_data('email')
      user.password1        = self.cleaned_data('password1')
      user.password2        = self.cleaned_data('password2')
      user.first_name       = self.cleaned_data('first_name')
      user.last_name        = self.cleaned_data('last_name')
      user.phone            = self.cleaned_data('phone')
      user.mobile           = self.cleaned_data('mobile')
      user.web              = self.cleaned_data('web')
      user.street           = self.cleaned_data('street')
      user.street_number    = self.cleaned_data('street_number')
      user.city             = self.cleaned_data('city')
      user.country          = self.cleaned_data('country')
      user.zipcode          = self.cleaned_data('zipcode')
      user.district         = self.cleaned_data('district')
      user.latitude         = self.cleaned_data('latitude')
      user.longtitude       = self.cleaned_data('longtitude')
      user.experience       = self.cleaned_data('experience')
      user.hour_rate_from   = self.cleaned_data('hour_rate_from')
      user.hour_rate_to     = self.cleaned_data('hour_rate_to')
      user.bio              = self.cleaned_data('bio')
      user.profile_img      = self.cleaned_data('profile_img')

      if commit:
        user.save()

      return user
